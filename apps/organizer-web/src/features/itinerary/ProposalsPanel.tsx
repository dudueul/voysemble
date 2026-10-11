// Copyright 2026- At Day. All rights reserved.
// Pending change proposals from leaders (D24), shown above the live editor. Accept applies the
// proposal to the server draft and the editor reloads; reject records the reason. Decided
// proposals stay listed under the pending ones so the organizer sees what happened.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ItineraryProposal } from '@voysemble/contracts';
import { useState } from 'react';
import { Icons } from '../../app/shell/icons';
import { ApiError } from '../../lib/api-client';
import { relativeTo } from '../../lib/format';
import { describePatch, proposalsApi } from '../../lib/itinerary-api';
import { strings } from '../../lib/strings';

const s = strings.itinerary;

export const proposalsKey = (orgId: string, tripId: string) =>
  ['orgs', orgId, 'trips', tripId, 'itinerary', 'proposals'] as const;

function ProposalRow({
  orgId,
  tripId,
  p,
  onApplied,
}: {
  orgId: string;
  tripId: string;
  p: ItineraryProposal;
  onApplied: () => void;
}) {
  const qc = useQueryClient();
  const [note, setNote] = useState('');
  const decide = useMutation({
    mutationFn: (decision: 'accept' | 'reject') =>
      proposalsApi.decide(orgId, tripId, p.id, decision, note.trim() || null),
    onSuccess: (_result, decision) => {
      void qc.invalidateQueries({ queryKey: proposalsKey(orgId, tripId) });
      if (decision === 'accept') onApplied();
    },
  });
  const now = new Date().toISOString();
  const pending = p.status === 'pending';
  return (
    <li className="proposal" data-testid={`proposal-${p.id}`}>
      <div className="proposal__text">
        <strong>
          <span className="chip chip--scheduled">{s.proposalKind[p.kind]}</span>{' '}
          {p.eventTitle ?? '—'}
        </strong>
        <span className="small">{describePatch(p.patch) || '—'}</span>
        <span className="muted small">
          {p.note} · {s.proposedBy(p.proposedByName, relativeTo(now, p.proposedAt))}
        </span>
        {!pending ? (
          <span className="small">
            {s.proposalDecided(p.status, p.decidedByName ?? '')}
            {p.decisionNote ? ` · ${p.decisionNote}` : ''}
          </span>
        ) : null}
      </div>
      {pending ? (
        <div className="proposal__actions">
          <input
            className="field__input field__input--inline"
            aria-label={s.decisionNote}
            placeholder={s.decisionNote}
            maxLength={500}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <button
            type="button"
            className="btn btn--primary btn--sm"
            disabled={decide.isPending}
            onClick={() => decide.mutate('accept')}
          >
            {s.accept}
          </button>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            disabled={decide.isPending}
            onClick={() => decide.mutate('reject')}
          >
            {s.reject}
          </button>
          {decide.isError ? (
            <span className="field__error" role="alert">
              {decide.error instanceof ApiError ? decide.error.message : s.decideFailed}
            </span>
          ) : null}
        </div>
      ) : (
        <span className={`chip chip--${p.status === 'accepted' ? 'done' : 'delayed'}`}>
          {p.status}
        </span>
      )}
    </li>
  );
}

export function ProposalsPanel({
  orgId,
  tripId,
  onApplied,
}: {
  orgId: string;
  tripId: string;
  onApplied: () => void;
}) {
  const q = useQuery({
    queryKey: proposalsKey(orgId, tripId),
    queryFn: () => proposalsApi.list(orgId, tripId),
    staleTime: 15_000,
  });
  const items = q.data ?? [];
  if (items.length === 0) return null;
  const pending = items.filter((p) => p.status === 'pending').length;
  return (
    <section className="card proposals" aria-labelledby="pr-title" data-testid="proposals">
      <div className="card__head">
        <h2 className="card__title" id="pr-title">
          <Icons.alert width="16" height="16" /> {s.proposals(pending)}
        </h2>
      </div>
      <ul className="list card__body">
        {items.map((p) => (
          <ProposalRow key={p.id} orgId={orgId} tripId={tripId} p={p} onApplied={onApplied} />
        ))}
      </ul>
    </section>
  );
}
