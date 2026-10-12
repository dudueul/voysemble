// Copyright 2026- At Day. All rights reserved.
// Preparation: documents & forms (gallery #28/#18, D27) and the packing checklist. Live (slice
// 045) once the organization has a trip: the requirements with their counts from
// `GET .../documents`, one requirement opened as a table of travelers with a state and the scan
// facts, scan uploads as multipart, and the audited reveal, which needs a step-up confirmation
// (D35): a 403 REAUTH_REQUIRED sends the confirmation link and the page says so; the reauth
// landing page returns here. The scan shows with a watermark and is never cached. The packing
// checklist (D38, slice 048) is live too: the organizer's items with how many travelers packed
// each, the add form, and every traveler's progress; the ticks come from the phones. The fixture
// otherwise.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  DocumentItem,
  DocumentRequirement,
  DocumentState,
  Organization,
  Trip,
} from '@voysemble/contracts';
import { type ChangeEvent, type FormEvent, useRef, useState } from 'react';
import { Icons } from '../../app/shell/icons';
import { documents as documentsFixture, packingChecklist } from '../../fixtures/sections';
import { ApiError } from '../../lib/api-client';
import { errorText } from '../../lib/errors';
import { storeReauthNext } from '../../lib/reauth';
import {
  auth,
  documentItemsQuery,
  documents as documentsApi,
  documentsQuery,
  meQuery,
  orgsQuery,
  packing as packingApi,
  packingQuery,
  pickActiveOrg,
  tripsQuery,
  useActiveTrip,
} from '../../lib/session';
import { strings } from '../../lib/strings';
import { Card, Meter, SectionPage } from './SectionPage';

const s = strings.preparation;

export function PreparationPage() {
  const orgs = useQuery(orgsQuery);
  const org = orgs.data ? pickActiveOrg(orgs.data) : null;
  const trips = useQuery({ ...tripsQuery(org?.id ?? ''), enabled: Boolean(org) });
  const trip = useActiveTrip(org?.id ?? '', trips.data);
  if (org && trip) return <LivePreparation org={org} trip={trip} />;
  return <FixturePreparation />;
}

function LivePreparation({ org, trip }: { org: Organization; trip: Trip }) {
  const qc = useQueryClient();
  const docs = useQuery(documentsQuery(org.id, trip.id));
  const [open, setOpen] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [required, setRequired] = useState(true);
  const [dueOn, setDueOn] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const refresh = () =>
    qc.invalidateQueries({ queryKey: documentsQuery(org.id, trip.id).queryKey });
  const create = useMutation({
    mutationFn: () =>
      documentsApi.create(org.id, trip.id, {
        name: name.trim(),
        required,
        dueOn: dueOn.trim() || null,
      }),
    onSuccess: () => {
      setName('');
      setDueOn('');
      setNote(null);
      void refresh();
    },
    onError: (e) => setNote(errorText(e, s.addFailed)),
  });
  // Slice 060 (D27, D29): one nudge per day to everyone still missing a document.
  const [remindNote, setRemindNote] = useState<string | null>(null);
  const remind = useMutation({
    mutationFn: (id: string) => documentsApi.remind(org.id, trip.id, id),
    onSuccess: (r) => setRemindNote(s.reminded(r.reminded, r.skipped)),
    onError: (e) => setRemindNote(errorText(e, s.remindFailed)),
  });
  const remove = useMutation({
    mutationFn: (id: string) => documentsApi.remove(org.id, trip.id, id),
    onSuccess: (_r, id) => {
      if (open === id) setOpen(null);
      void refresh();
    },
    onError: (e) => setNote(errorText(e, s.actionFailed)),
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (name.trim()) create.mutate();
  };
  const list = docs.data?.requirements ?? [];
  const opened = list.find((r) => r.id === open) ?? null;
  return (
    <SectionPage
      title={strings.nav.preparation}
      subtitle={docs.data ? s.liveSubtitle(docs.data.missingRequired, docs.data.travelers) : ''}
      sample={false}
      actions={<span className="chip chip--active">{strings.dashboard.live}</span>}
    >
      <div className="grid">
        <Card title={s.documents} id="prep-docs">
          {docs.isPending ? (
            <p className="muted small" role="status">
              {strings.settings.loading}
            </p>
          ) : docs.isError ? (
            <p className="muted small" role="status">
              {errorText(docs.error, s.loadFailed)}
            </p>
          ) : list.length === 0 ? (
            <p className="muted small">{s.noRequirements}</p>
          ) : (
            <table className="table" data-testid="doc-table">
              <thead>
                <tr>
                  <th>{s.colDocument}</th>
                  <th>{s.colRequired}</th>
                  <th>{s.colCollected}</th>
                  <th>{s.colDue}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {list.map((d) => {
                  const done = d.counts.collected + d.counts.waived;
                  const complete = d.counts.travelers > 0 && done === d.counts.travelers;
                  return (
                    <tr key={d.id} data-testid={`req-${d.id}`}>
                      <td>
                        <strong>{d.name}</strong>
                      </td>
                      <td>{d.required ? s.required : s.optional}</td>
                      <td>
                        <div className="cellmeter">
                          <Meter
                            value={done}
                            max={Math.max(1, d.counts.travelers)}
                            tone={complete ? 'ok' : d.required ? 'warn' : 'brand'}
                            label={s.collected(done, d.counts.travelers)}
                          />
                          <span className="small" data-testid={`doc-${d.id}`}>
                            {done}/{d.counts.travelers}
                          </span>
                        </div>
                      </td>
                      <td className="muted">{d.dueOn ?? ''}</td>
                      <td>
                        <div className="missing__actions">
                          {complete ? <span className="chip chip--done">{s.complete}</span> : null}
                          {d.counts.missing > 0 ? (
                            <button
                              type="button"
                              className="btn btn--ghost btn--sm"
                              onClick={() => remind.mutate(d.id)}
                              disabled={remind.isPending}
                              aria-label={s.remindOf(d.name)}
                            >
                              {s.remind(d.counts.missing)}
                            </button>
                          ) : null}
                          <button
                            type="button"
                            className="btn btn--ghost btn--sm"
                            onClick={() => setOpen(open === d.id ? null : d.id)}
                            aria-label={s.openOf(d.name)}
                          >
                            {open === d.id ? s.close : s.open}
                          </button>
                          <button
                            type="button"
                            className="btn btn--ghost btn--sm"
                            onClick={() => remove.mutate(d.id)}
                            disabled={remove.isPending}
                            aria-label={s.removeRequirementOf(d.name)}
                          >
                            {s.removeRequirement}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          <p className="field__hint" role="status" data-testid="remind-status">
            {remindNote ?? ''}
          </p>
          <form className="form" onSubmit={submit} aria-label={s.addForm} noValidate>
            <div className="field__row">
              <label className="field">
                <span className="field__label">{s.nameLabel}</span>
                <input
                  className="field__input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  maxLength={80}
                />
              </label>
              <label className="field">
                <span className="field__label">{s.dueLabel}</span>
                <input
                  className="field__input"
                  type="date"
                  value={dueOn}
                  onChange={(e) => setDueOn(e.target.value)}
                />
              </label>
            </div>
            <label className="checklist__item">
              <input
                type="checkbox"
                checked={required}
                onChange={(e) => setRequired(e.target.checked)}
              />{' '}
              {s.requiredLabel}
            </label>
            <div className="field__row field__row--tight">
              <button
                type="submit"
                className="btn btn--primary btn--sm"
                disabled={create.isPending || !name.trim()}
              >
                <Icons.plus /> {create.isPending ? s.adding : s.add}
              </button>
              <span className="field__hint" role="status" data-testid="prep-status">
                {note ?? ''}
              </span>
            </div>
          </form>
          <p className="muted small">{s.scanRule}</p>
        </Card>
        {opened ? (
          <Card title={s.itemsTitle(opened.name)} id="prep-items">
            <ItemsTable org={org} trip={trip} requirement={opened} />
          </Card>
        ) : (
          <LivePackingCard org={org} trip={trip} />
        )}
      </div>
      {opened ? (
        <div className="grid">
          <LivePackingCard org={org} trip={trip} />
        </div>
      ) : null}
    </SectionPage>
  );
}

/** The organizer's packing checklist (D38): items with their counts, the add form, progress per traveler. */
function LivePackingCard({ org, trip }: { org: Organization; trip: Trip }) {
  const qc = useQueryClient();
  const list = useQuery(packingQuery(org.id, trip.id));
  const [name, setName] = useState('');
  const [itemNote, setItemNote] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: packingQuery(org.id, trip.id).queryKey });
  const create = useMutation({
    mutationFn: () =>
      packingApi.create(org.id, trip.id, { name: name.trim(), note: itemNote.trim() }),
    onSuccess: () => {
      setName('');
      setItemNote('');
      setNote(null);
      void refresh();
    },
    onError: (e) => setNote(errorText(e, s.packingAddFailed)),
  });
  const remove = useMutation({
    mutationFn: (id: string) => packingApi.remove(org.id, trip.id, id),
    onSuccess: () => {
      setNote(null);
      void refresh();
    },
    onError: (e) => setNote(errorText(e, s.actionFailed)),
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (name.trim()) create.mutate();
  };
  const data = list.data;
  return (
    <Card title={s.packingLive} id="prep-packing">
      <p className="muted small">{s.packingHint}</p>
      {list.isPending ? (
        <p className="muted small" role="status">
          {strings.settings.loading}
        </p>
      ) : list.isError ? (
        <p className="muted small" role="status">
          {errorText(list.error, s.packingLoadFailed)}
        </p>
      ) : data ? (
        <>
          <p className="small" data-testid="packing-ready">
            <strong>{s.packingReady(data.ready, data.travelers.length)}</strong>
          </p>
          {data.items.length === 0 ? (
            <p className="muted small">{s.packingNone}</p>
          ) : (
            <ul className="list" data-testid="packing">
              {data.items.map((it) => {
                const complete =
                  it.counts.travelers > 0 && it.counts.packed === it.counts.travelers;
                return (
                  <li key={it.id} className="busrow" data-testid={`packing-${it.id}`}>
                    <div className="flight__route">
                      <strong>{it.name}</strong>
                      {it.note ? <span className="muted small">{it.note}</span> : null}
                    </div>
                    <div className="stack" style={{ gap: 4 }}>
                      <Meter
                        value={it.counts.packed}
                        max={Math.max(1, it.counts.travelers)}
                        tone={complete ? 'ok' : 'brand'}
                        label={s.packingPacked(it.counts.packed, it.counts.travelers)}
                      />
                      <span className="small">
                        {s.packingPacked(it.counts.packed, it.counts.travelers)}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      disabled={remove.isPending}
                      onClick={() => remove.mutate(it.id)}
                      aria-label={s.packingRemoveOf(it.name)}
                    >
                      {s.packingRemove}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {data.items.length > 0 && data.travelers.length > 0 ? (
            <details className="small">
              <summary>{s.packingTravelers}</summary>
              <ul className="list list--plain" data-testid="packing-travelers">
                {data.travelers.map((p) => (
                  <li key={p.participationId}>
                    {p.displayName}
                    {p.groupName ? ` · ${p.groupName}` : ''} · {p.packed}/{p.total}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </>
      ) : null}
      <form className="form" onSubmit={submit} aria-label={s.packingAddForm} noValidate>
        <div className="field__row">
          <label className="field">
            <span className="field__label">{s.packingItemLabel}</span>
            <input
              className="field__input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={80}
            />
          </label>
          <label className="field">
            <span className="field__label">{s.packingNoteLabel}</span>
            <input
              className="field__input"
              value={itemNote}
              onChange={(e) => setItemNote(e.target.value)}
              maxLength={160}
            />
          </label>
        </div>
        <div className="field__row field__row--tight">
          <button
            type="submit"
            className="btn btn--primary btn--sm"
            disabled={create.isPending || !name.trim()}
          >
            <Icons.plus /> {create.isPending ? s.adding : s.add}
          </button>
          <span className="field__hint" role="status" data-testid="packing-status">
            {note ?? ''}
          </span>
        </div>
      </form>
    </Card>
  );
}

const typeLabel = (type: string) => (type === 'application/pdf' ? s.pdf : s.image);

function ItemsTable({
  org,
  trip,
  requirement,
}: {
  org: Organization;
  trip: Trip;
  requirement: DocumentRequirement;
}) {
  const qc = useQueryClient();
  const me = useQuery(meQuery);
  const items = useQuery(documentItemsQuery(org.id, trip.id, requirement.id));
  const [note, setNote] = useState<string | null>(null);
  const [pendingFor, setPendingFor] = useState<string | null>(null);
  const [viewer, setViewer] = useState<{ item: DocumentItem; url: string; type: string } | null>(
    null,
  );
  const input = useRef<HTMLInputElement>(null);
  const refresh = () => {
    void qc.invalidateQueries({
      queryKey: documentItemsQuery(org.id, trip.id, requirement.id).queryKey,
    });
    void qc.invalidateQueries({ queryKey: documentsQuery(org.id, trip.id).queryKey });
  };
  const act = useMutation({
    mutationFn: (fn: () => Promise<unknown>) => fn(),
    onSuccess: () => {
      setNote(null);
      refresh();
    },
    onError: (e) => setNote(errorText(e, s.actionFailed)),
  });
  const upload = useMutation({
    mutationFn: ({ participationId, file }: { participationId: string; file: File }) => {
      const form = new FormData();
      form.append('file', file, file.name);
      return documentsApi.uploadScan(org.id, trip.id, requirement.id, participationId, form);
    },
    onSuccess: () => {
      setNote(null);
      refresh();
    },
    onError: (e) => setNote(errorText(e, s.scanFailed)),
  });
  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file && pendingFor) upload.mutate({ participationId: pendingFor, file });
    setPendingFor(null);
  };
  const reveal = useMutation({
    mutationFn: async (item: DocumentItem) => {
      const res = await fetch(
        documentsApi.revealPath(org.id, trip.id, requirement.id, item.participationId),
        { method: 'POST', credentials: 'same-origin', cache: 'no-store' },
      );
      if (res.status === 403) {
        // D35: confirm first. The link comes back here; the organizer reveals again.
        storeReauthNext('/preparation');
        setNote(s.reauthSending);
        await auth.reauth();
        throw new ApiError(403, 'REAUTH_REQUIRED', 'reauth', 'none');
      }
      if (!res.ok) throw new ApiError(res.status, 'INTERNAL', 'reveal failed', 'none');
      const type = res.headers.get('content-type') ?? 'application/octet-stream';
      const blob = await res.blob();
      const url = typeof URL.createObjectURL === 'function' ? URL.createObjectURL(blob) : '';
      return { item, url, type };
    },
    onSuccess: (v) => {
      if (viewer?.url) URL.revokeObjectURL?.(viewer.url);
      setViewer(v);
      setNote(null);
      refresh();
    },
    onError: (e) =>
      setNote(
        e instanceof ApiError && e.code === 'REAUTH_REQUIRED'
          ? s.reauthNeeded
          : errorText(e, s.actionFailed),
      ),
  });
  const rows = items.data?.items ?? [];
  const when = new Date().toISOString().slice(0, 16).replace('T', ' ');
  return (
    <>
      <input
        ref={input}
        type="file"
        accept="application/pdf,image/jpeg,image/png"
        hidden
        data-testid="scan-input"
        onChange={onFile}
      />
      {items.isPending ? (
        <p className="muted small" role="status">
          {strings.settings.loading}
        </p>
      ) : items.isError ? (
        <p className="muted small" role="status">
          {errorText(items.error, s.loadFailed)}
        </p>
      ) : (
        <table className="table" data-testid="doc-items">
          <thead>
            <tr>
              <th>{s.colTraveler}</th>
              <th>{s.colGroup}</th>
              <th>{s.colState}</th>
              <th>{s.colScan}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((it) => (
              <tr key={it.participationId} data-testid={`item-${it.participationId}`}>
                <td>
                  <strong>{it.displayName}</strong>
                </td>
                <td className="muted">{it.groupName ?? ''}</td>
                <td>
                  <select
                    className="field__input"
                    value={it.state}
                    aria-label={s.stateOf(it.displayName)}
                    disabled={act.isPending}
                    onChange={(e) => {
                      const state = e.target.value as DocumentState;
                      act.mutate(() =>
                        documentsApi.setState(
                          org.id,
                          trip.id,
                          requirement.id,
                          it.participationId,
                          state,
                        ),
                      );
                    }}
                  >
                    {(['missing', 'collected', 'waived'] as const).map((st) => (
                      <option key={st} value={st}>
                        {s.state[st] ?? st}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <div className="stack" style={{ gap: 4 }}>
                    <span className="small muted">
                      {it.scan
                        ? s.scanOnFile(typeLabel(it.scan.contentType), it.scan.uploadedByName)
                        : s.noScan}
                      {it.reveals > 0 ? ` · ${s.reveals(it.reveals)}` : ''}
                    </span>
                    <div className="missing__actions">
                      {it.scan ? (
                        <>
                          <button
                            type="button"
                            className="btn btn--primary btn--sm"
                            disabled={reveal.isPending}
                            onClick={() => reveal.mutate(it)}
                            aria-label={s.revealOf(it.displayName)}
                          >
                            {s.reveal}
                          </button>
                          <button
                            type="button"
                            className="btn btn--ghost btn--sm"
                            disabled={act.isPending}
                            onClick={() =>
                              act.mutate(() =>
                                documentsApi.removeScan(
                                  org.id,
                                  trip.id,
                                  requirement.id,
                                  it.participationId,
                                ),
                              )
                            }
                            aria-label={s.removeScanOf(it.displayName)}
                          >
                            {s.removeScan}
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className="btn btn--ghost btn--sm"
                          disabled={upload.isPending}
                          onClick={() => {
                            setPendingFor(it.participationId);
                            input.current?.click();
                          }}
                          aria-label={s.uploadScanOf(it.displayName)}
                        >
                          {s.uploadScan}
                        </button>
                      )}
                    </div>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="field__hint" role="status" data-testid="items-status">
        {note ?? ''}
      </p>
      {viewer ? (
        <div className="stack" data-testid="scan-viewer">
          <strong>{s.viewerTitle(viewer.item.displayName, requirement.name)}</strong>
          <div className="scan">
            {viewer.type.startsWith('application/pdf') ? (
              <iframe
                title={s.viewerTitle(viewer.item.displayName, requirement.name)}
                src={viewer.url}
              />
            ) : (
              <img
                src={viewer.url}
                alt={s.viewerTitle(viewer.item.displayName, requirement.name)}
              />
            )}
            <div className="scan__mark" data-testid="scan-watermark">
              {s.viewerWatermark(me.data?.email ?? '', when)}
            </div>
          </div>
          <div className="missing__actions">
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => {
                if (viewer.url) URL.revokeObjectURL?.(viewer.url);
                setViewer(null);
              }}
            >
              {s.viewerHide}
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}

function PackingCard({ sample = false }: { sample?: boolean }) {
  return (
    <Card
      title={s.packing}
      id="prep-packing"
      action={
        sample ? (
          <span className="chip chip--sample">{strings.dashboard.simulated}</span>
        ) : undefined
      }
    >
      <ul className="list list--plain checklist" data-testid="packing">
        {packingChecklist.map((p) => (
          <li key={p.item} className={p.done ? 'checklist__done' : ''}>
            <span className={`check ${p.done ? 'check--on' : ''}`} aria-hidden="true">
              {p.done ? <Icons.check /> : null}
            </span>
            {p.item}
          </li>
        ))}
      </ul>
      <p className="muted small">{s.packingNote}</p>
    </Card>
  );
}

function FixturePreparation() {
  const missing = documentsFixture
    .filter((d) => d.required)
    .reduce((n, d) => n + (d.total - d.collected), 0);
  return (
    <SectionPage
      title={strings.nav.preparation}
      subtitle={s.subtitle(missing)}
      actions={
        <button type="button" className="btn btn--primary btn--sm">
          <Icons.plus /> {s.addRequirement}
        </button>
      }
    >
      <div className="grid">
        <Card title={s.documents} id="prep-docs">
          <table className="table" data-testid="doc-table">
            <thead>
              <tr>
                <th>{s.colDocument}</th>
                <th>{s.colRequired}</th>
                <th>{s.colCollected}</th>
                <th>{s.colDue}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {documentsFixture.map((d) => {
                const done = d.collected === d.total;
                return (
                  <tr key={d.id}>
                    <td>
                      <strong>{d.name}</strong>
                    </td>
                    <td>{d.required ? s.required : s.optional}</td>
                    <td>
                      <div className="cellmeter">
                        <Meter
                          value={d.collected}
                          max={d.total}
                          tone={done ? 'ok' : d.required ? 'warn' : 'brand'}
                          label={s.collected(d.collected, d.total)}
                        />
                        <span className="small" data-testid={`doc-${d.id}`}>
                          {d.collected}/{d.total}
                        </span>
                      </div>
                    </td>
                    <td className="muted">{d.dueOn}</td>
                    <td>
                      {done ? (
                        <span className="chip chip--done">{s.complete}</span>
                      ) : (
                        <button type="button" className="linkbtn">
                          {s.remind(d.total - d.collected)}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="muted small">{s.scanRule}</p>
        </Card>
        <PackingCard />
      </div>
    </SectionPage>
  );
}
