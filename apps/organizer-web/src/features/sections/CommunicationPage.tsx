// Copyright 2026- At Day. All rights reserved.
// Messages & announcements (gallery #27). Announcements are real (slice 010): list, publish, ack
// progress, and the unacked names from the API for the active organization's first trip.
// Channels (D22) are live since slice 033: the organizer's list (the trip and one per guardian),
// a thread with a composer; the fixture shows without a trip with its "Sample data" chip.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Announcement, ChatChannel } from '@voysemble/contracts';
import { type FormEvent, useState } from 'react';
import { Icons } from '../../app/shell/icons';
import { FROZEN_NOW } from '../../fixtures/korea-concert-tour';
import { channels } from '../../fixtures/sections';
import { ApiError } from '../../lib/api-client';
import { relativeTo } from '../../lib/format';
import { changeLines } from '../../lib/itinerary-api';
import {
  ackStatusQuery,
  announcements as announcementsApi,
  announcementsQuery,
  chat as chatApi,
  chatMessagesQuery,
  chatsQuery,
  orgsQuery,
  pickActiveOrg,
  tripsQuery,
  useActiveTrip,
} from '../../lib/session';
import { strings } from '../../lib/strings';
import { Card, Meter, SectionPage } from './SectionPage';

const s = strings.communication;

function UnackedNames({ orgId, tripId, a }: { orgId: string; tripId: string; a: Announcement }) {
  const [open, setOpen] = useState(false);
  const status = useQuery({ ...ackStatusQuery(orgId, tripId, a.id), enabled: open });
  return (
    <span className="small muted">
      {!open ? (
        <button type="button" className="linkbtn" onClick={() => setOpen(true)}>
          {s.whoHasNot}
        </button>
      ) : status.isPending ? (
        strings.states.loading
      ) : status.isError ? (
        s.statusFailed
      ) : status.data.unacked.length === 0 ? (
        s.everyoneAcked
      ) : (
        <span data-testid={`unacked-${a.id}`}>
          {s.unacked}: {status.data.unacked.map((e) => e.displayName).join(', ')}
        </span>
      )}
    </span>
  );
}

function AnnouncementRow({ orgId, tripId, a }: { orgId: string; tripId: string; a: Announcement }) {
  return (
    <li className="ann" data-testid={`announcement-${a.id}`}>
      <div className="ann__head">
        <strong>{a.title}</strong>
        <span className="muted small">
          {a.authorName} ·{' '}
          {new Date(a.publishedAt).toLocaleString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            month: 'short',
            day: 'numeric',
          })}
        </span>
      </div>
      {a.kind === 'itinerary_revision' && a.revision ? (
        <span className="chip chip--scheduled" data-testid={`revision-chip-${a.id}`}>
          {s.revisionChip(a.revision.revision)}
        </span>
      ) : null}
      <p className="ann__body ann__body--pre">{a.body}</p>
      {a.kind === 'itinerary_revision' && a.revision && a.revision.changes.length > 0 ? (
        <ul className="ann__changes" data-testid={`changes-${a.id}`}>
          {changeLines(a.revision).map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}
      {a.translation ? (
        <div className="ann__translation" data-testid={`translation-${a.id}`}>
          <span className="muted small">
            {a.translation.provider === 'edited'
              ? s.editedTranslation(a.translation.editedBy ?? '', a.translation.locale)
              : s.machineTranslation(a.translation.locale)}
          </span>
          <p className="ann__body" lang={a.translation.locale}>
            {a.translation.body}
          </p>
        </div>
      ) : null}
      <div className="ann__meta">
        {a.requiresAck ? <span className="chip chip--scheduled">{s.requiresAck}</span> : null}
        {a.sharedWithGuardians ? (
          <span className="chip chip--scheduled">{s.sharedWithGuardians}</span>
        ) : null}
      </div>
      {a.requiresAck ? (
        <div className="ann__ack">
          <Meter
            value={a.ackCount}
            max={a.ackTotal}
            tone={a.ackTotal > 0 && a.ackCount === a.ackTotal ? 'ok' : 'warn'}
            label={s.ackLabel(a.ackCount, a.ackTotal)}
          />
          <span className="small" data-testid={`ack-${a.id}`}>
            {a.ackCount}/{a.ackTotal}
          </span>
          <UnackedNames orgId={orgId} tripId={tripId} a={a} />
        </div>
      ) : null}
    </li>
  );
}

function Composer({ orgId, tripId }: { orgId: string; tripId: string }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    title: '',
    body: '',
    requiresAck: true,
    sharedWithGuardians: false,
  });
  const publish = useMutation({
    mutationFn: () => announcementsApi.create(orgId, tripId, form),
    onSuccess: () => {
      setForm({ title: '', body: '', requiresAck: true, sharedWithGuardians: false });
      void qc.invalidateQueries({ queryKey: announcementsQuery(orgId, tripId).queryKey });
    },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (form.title.trim() && form.body.trim()) publish.mutate();
  };
  return (
    <Card title={s.composer} id="comm-compose">
      <form className="form" onSubmit={submit}>
        <label className="field">
          <span className="field__label">{s.title}</span>
          <input
            className="field__input"
            name="title"
            maxLength={120}
            required
            value={form.title}
            placeholder={s.titlePlaceholder}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          />
        </label>
        <label className="field">
          <span className="field__label">{s.body}</span>
          <textarea
            className="field__input field__textarea"
            name="body"
            rows={3}
            maxLength={2000}
            required
            value={form.body}
            onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
          />
        </label>
        <div className="field__row">
          <label className="radio">
            <input
              type="checkbox"
              checked={form.requiresAck}
              onChange={(e) => setForm((f) => ({ ...f, requiresAck: e.target.checked }))}
            />{' '}
            {s.requiresAck}
          </label>
          <label className="radio">
            <input
              type="checkbox"
              checked={form.sharedWithGuardians}
              onChange={(e) => setForm((f) => ({ ...f, sharedWithGuardians: e.target.checked }))}
            />{' '}
            {s.sharedWithGuardians}
          </label>
        </div>
        <p className="field__hint">{s.translationNote}</p>
        {publish.isError ? (
          <p className="field__error" role="alert">
            {publish.error instanceof ApiError
              ? `${publish.error.message} (${strings.auth.reference(publish.error.correlationId)})`
              : String(publish.error)}
          </p>
        ) : null}
        <div className="form__actions">
          <button type="submit" className="btn btn--primary" disabled={publish.isPending}>
            {s.publish}
          </button>
        </div>
      </form>
    </Card>
  );
}

/** One channel's messages with the composer (slice 033). Polls every 15 s; opening marks it read. */
function ChatThread({
  orgId,
  tripId,
  channel,
  onBack,
}: {
  orgId: string;
  tripId: string;
  channel: ChatChannel;
  onBack: () => void;
}) {
  const qc = useQueryClient();
  const q = useQuery(chatMessagesQuery(orgId, tripId, channel.id));
  const [draft, setDraft] = useState('');
  const send = useMutation({
    mutationFn: (body: string) => chatApi.send(orgId, tripId, channel.id, body),
    onSuccess: () => {
      setDraft('');
      void qc.invalidateQueries({
        queryKey: chatMessagesQuery(orgId, tripId, channel.id).queryKey,
      });
      void qc.invalidateQueries({ queryKey: chatsQuery(orgId, tripId).queryKey });
    },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (draft.trim()) send.mutate(draft.trim());
  };
  const now = new Date().toISOString();
  return (
    <div data-testid="chat-thread">
      <p className="small">
        <button type="button" className="linkbtn" onClick={onBack}>
          ← {s.backToChannels}
        </button>{' '}
        · <strong>{channel.title}</strong> <span className="muted">{channel.subtitle}</span>
      </p>
      {q.isPending ? (
        <p className="state__body" role="status">
          {strings.states.loading}
        </p>
      ) : q.isError ? (
        <p className="field__error" role="alert">
          {q.error instanceof ApiError ? q.error.message : String(q.error)}
        </p>
      ) : q.data.messages.length === 0 ? (
        <p className="state__body" role="status">
          {s.noMessages}
        </p>
      ) : (
        <div className="chat-thread" data-testid="chat-messages">
          {q.data.messages.map((m) => (
            <div key={m.id} className={`bubble${m.mine ? ' bubble--mine' : ''}`}>
              {m.mine ? null : (
                <span className="bubble__meta">
                  {m.senderName} · {m.senderRole}
                </span>
              )}
              <span>{m.body}</span>
              <span className="bubble__meta">{relativeTo(now, m.sentAt)}</span>
            </div>
          ))}
        </div>
      )}
      <form className="chat-compose" onSubmit={submit} aria-label={s.send}>
        <input
          className="field__input"
          aria-label={s.messageLabel}
          placeholder={s.messageLabel}
          maxLength={1000}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button
          type="submit"
          className="btn btn--primary btn--sm"
          disabled={send.isPending || !draft.trim()}
        >
          {s.send}
        </button>
        {send.isError ? (
          <span className="field__error" role="alert">
            {send.error instanceof ApiError ? send.error.message : s.sendFailed}
          </span>
        ) : null}
      </form>
    </div>
  );
}

/** The organizer's channels (D22): the whole trip and one per guardian. */
function LiveChannels({ orgId, tripId }: { orgId: string; tripId: string }) {
  const list = useQuery(chatsQuery(orgId, tripId));
  const [openId, setOpenId] = useState<string | null>(null);
  const open = list.data?.find((c) => c.id === openId) ?? null;
  if (open)
    return (
      <ChatThread orgId={orgId} tripId={tripId} channel={open} onBack={() => setOpenId(null)} />
    );
  if (list.isPending) {
    return (
      <p className="state__body" role="status">
        {strings.states.loading}
      </p>
    );
  }
  if (list.isError) {
    return (
      <p className="field__error" role="alert">
        {list.error instanceof ApiError ? list.error.message : String(list.error)}
      </p>
    );
  }
  const now = new Date().toISOString();
  return (
    <>
      <p className="muted small">{s.chatIntro}</p>
      {list.data.length === 0 ? (
        <p className="state__body" role="status">
          {s.noChannels}
        </p>
      ) : (
        <ul className="list" data-testid="channel-list">
          {list.data.map((c) => (
            <li key={c.id} className="channel">
              <button
                type="button"
                className="channel--button channel"
                aria-label={s.openChannel(c.title)}
                onClick={() => setOpenId(c.id)}
              >
                <span className="channel__icon" aria-hidden="true">
                  {c.kind === 'trip' ? <Icons.people /> : <Icons.chat />}
                </span>
                <span className="channel__text">
                  <span className="channel__name">
                    {c.title}
                    {c.unread ? (
                      <span className="badge" data-testid={`unread-${c.id}`}>
                        {c.unread}
                      </span>
                    ) : null}
                  </span>
                  <span className="muted small">{c.lastMessage?.body ?? c.subtitle}</span>
                </span>
                <span className="muted small">
                  {c.lastMessage ? relativeTo(now, c.lastMessage.sentAt) : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export function CommunicationPage() {
  const orgs = useQuery(orgsQuery);
  const org = orgs.data ? pickActiveOrg(orgs.data) : null;
  const trips = useQuery({ ...tripsQuery(org?.id ?? ''), enabled: Boolean(org) });
  const trip = useActiveTrip(org?.id ?? '', trips.data);
  const list = useQuery({
    ...announcementsQuery(org?.id ?? '', trip?.id ?? ''),
    enabled: Boolean(org && trip),
  });
  const items = list.data ?? [];
  const waiting = items.filter((a) => a.requiresAck && a.ackCount < a.ackTotal).length;
  const ready = Boolean(org && trip);
  // A disabled query reports pending; only count the trips query once an org exists.
  const resolving = orgs.isPending || (org !== null && trips.isPending);
  const unreadChannels = channels.reduce((n, c) => n + c.unread, 0);

  return (
    <SectionPage
      title={strings.nav.communication}
      subtitle={ready ? (waiting ? s.waiting(waiting) : s.allAcked) : s.noTripSubtitle}
      sample={false}
      className="comm"
    >
      <div className="grid">
        <div className="stack">
          <Card title={s.announcements} id="comm-ann">
            {!ready ? (
              <p className="state__body" role="status">
                {resolving ? strings.states.loading : s.noTrip}{' '}
                {!resolving ? (
                  <a href="/setup" className="linkbtn">
                    {strings.setup.nav}
                  </a>
                ) : null}
              </p>
            ) : list.isPending ? (
              <p className="state__body" role="status">
                {strings.states.loading}
              </p>
            ) : list.isError ? (
              <p className="field__error" role="alert">
                {list.error instanceof ApiError
                  ? `${list.error.message} (${strings.auth.reference(list.error.correlationId)})`
                  : String(list.error)}
              </p>
            ) : items.length === 0 ? (
              <p className="state__body" role="status">
                {s.empty}
              </p>
            ) : (
              <ul className="list" data-testid="announcement-list">
                {org && trip
                  ? items.map((a) => (
                      <AnnouncementRow key={a.id} orgId={org.id} tripId={trip.id} a={a} />
                    ))
                  : null}
              </ul>
            )}
          </Card>
          {org && trip ? <Composer orgId={org.id} tripId={trip.id} /> : null}
        </div>
        <Card
          title={s.channels}
          id="comm-channels"
          action={
            org && trip ? (
              <span className="chip chip--active">{strings.dashboard.live}</span>
            ) : (
              <span className="chip chip--sample">{strings.dashboard.simulated}</span>
            )
          }
        >
          {org && trip ? (
            <LiveChannels orgId={org.id} tripId={trip.id} />
          ) : (
            <>
              <ul className="list" data-testid="channel-list">
                {channels.map((c) => (
                  <li key={c.id} className="channel">
                    <span className="channel__icon" aria-hidden="true">
                      {c.kind === 'trip-all' ? (
                        <Icons.people />
                      ) : c.kind === 'group' ? (
                        <Icons.bus />
                      ) : (
                        <Icons.chat />
                      )}
                    </span>
                    <span className="channel__text">
                      <span className="channel__name">
                        {c.name}
                        {c.unread ? <span className="badge">{c.unread}</span> : null}
                      </span>
                      <span className="muted small">{c.lastPreview}</span>
                    </span>
                    <span className="muted small">{relativeTo(FROZEN_NOW, c.lastAt)}</span>
                  </li>
                ))}
              </ul>
              <p className="muted small">
                {s.channelRule} {unreadChannels ? s.unreadNote(unreadChannels) : ''}
              </p>
            </>
          )}
        </Card>
      </div>
    </SectionPage>
  );
}
