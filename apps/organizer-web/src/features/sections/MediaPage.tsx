// Copyright 2026- At Day. All rights reserved.
// Media: trip pool, moderation queue, guardian album (gallery #12/#14, D18). Live (slice 043)
// once the organization has a trip: the pool and the queue come from `GET .../media`, uploads go
// up as multipart with a thumbnail made here (D34), a leader's decisions (clear, remove, album
// tags) go to their routes, and the page polls so a phone's upload shows within half a minute.
// Without a trip the fixture shows: hue-tinted placeholders, no licensed photos (doc 01 §15).

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Organization, Participation, Photo, Trip } from '@voysemble/contracts';
import { type ChangeEvent, useRef, useState } from 'react';
import { Icons } from '../../app/shell/icons';
import { media as mediaFixture } from '../../fixtures/sections';
import { errorText } from '../../lib/errors';
import {
  media as mediaApi,
  orgsQuery,
  photosQuery,
  pickActiveOrg,
  rosterQuery,
  tripsQuery,
} from '../../lib/session';
import { strings } from '../../lib/strings';
import { makeThumbnail } from '../../lib/thumbnail';
import { Card, SectionPage } from './SectionPage';

const s = strings.media;

function Thumb({ hue, label }: { hue: number; label: string }) {
  return (
    <span
      className="thumb"
      role="img"
      aria-label={label}
      style={{
        background: `linear-gradient(135deg, hsl(${hue} 55% 82%), hsl(${(hue + 40) % 360} 55% 62%))`,
      }}
    />
  );
}

export function MediaPage() {
  const orgs = useQuery(orgsQuery);
  const org = orgs.data ? pickActiveOrg(orgs.data) : null;
  const trips = useQuery({ ...tripsQuery(org?.id ?? ''), enabled: Boolean(org) });
  const trip = trips.data?.[0] ?? null;
  if (org && trip) return <LiveMedia org={org} trip={trip} />;
  return <FixtureMedia />;
}

/** One photo's caption line: who, and the trip day or "outside the trip". */
function dayLabel(p: Photo): string {
  return p.day > 0 ? s.day(p.day) : s.dayOutside;
}

function LiveMedia({ org, trip }: { org: Organization; trip: Trip }) {
  const qc = useQueryClient();
  const photos = useQuery(photosQuery(org.id, trip.id));
  const roster = useQuery(rosterQuery(org.id, trip.id));
  const travelers = (roster.data ?? []).filter((p) => p.role === 'traveler');
  const staff = org.role === 'owner' || org.role === 'organizer' || org.role === 'leader';
  const [note, setNote] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: photosQuery(org.id, trip.id).queryKey });

  const upload = useMutation({
    mutationFn: async (files: File[]) => {
      let done = 0;
      for (const file of files) {
        const form = new FormData();
        form.append('original', file, file.name);
        const thumb = await makeThumbnail(file);
        if (thumb) form.append('thumbnail', thumb, 'thumbnail');
        if (file.lastModified) form.append('takenAt', new Date(file.lastModified).toISOString());
        await mediaApi.upload(org.id, trip.id, form);
        done += 1;
      }
      return done;
    },
    onSuccess: (n) => {
      setNote(s.uploaded(n));
      void refresh();
    },
    onError: (e) => {
      setNote(errorText(e, s.uploadFailed));
      void refresh();
    },
  });
  const onFiles = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length === 0) return;
    setNote(s.uploading(files.length));
    upload.mutate(files);
  };
  const act = useMutation({
    mutationFn: (fn: () => Promise<unknown>) => fn(),
    onSuccess: () => {
      setNote(null);
      void refresh();
    },
    onError: (e) => setNote(errorText(e, s.actionFailed)),
  });

  const list = photos.data?.photos ?? [];
  const flagged = list.filter((p) => p.status === 'flagged');
  const pool = list.filter((p) => p.status !== 'flagged');
  const approved = list.filter((p) => p.status === 'approved');
  const actions = (
    <>
      <span className="chip chip--active">{strings.dashboard.live}</span>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        hidden
        data-testid="photo-input"
        onChange={onFiles}
      />
      <button
        type="button"
        className="btn btn--primary btn--sm"
        onClick={() => input.current?.click()}
        disabled={upload.isPending}
      >
        <Icons.plus /> {s.upload}
      </button>
    </>
  );
  return (
    <SectionPage
      title={strings.nav.media}
      subtitle={s.subtitle(list.length, approved.length, flagged.length)}
      sample={false}
      actions={actions}
    >
      <p className="field__hint" role="status" data-testid="media-status">
        {note ?? ''}
      </p>
      <div className="grid">
        <Card title={s.pool} id="media-pool">
          {photos.isPending ? (
            <p className="muted small" role="status">
              {strings.settings.loading}
            </p>
          ) : photos.isError ? (
            <p className="muted small" role="status">
              {errorText(photos.error, s.loadFailed)}
            </p>
          ) : pool.length === 0 ? (
            <p className="muted small">{s.noPhotos}</p>
          ) : (
            <div className="thumbs" data-testid="media-pool">
              {pool.map((p) => (
                <LivePhoto
                  key={p.id}
                  photo={p}
                  staff={staff}
                  travelers={travelers}
                  busy={act.isPending}
                  onAlbum={(tags) => act.mutate(() => mediaApi.album(org.id, trip.id, p.id, tags))}
                  onUnalbum={() => act.mutate(() => mediaApi.unalbum(org.id, trip.id, p.id))}
                  onDelete={() => act.mutate(() => mediaApi.remove(org.id, trip.id, p.id))}
                />
              ))}
            </div>
          )}
        </Card>
        <div className="stack">
          <Card title={s.queue} id="media-queue">
            <p className="muted small">{s.queueIntro}</p>
            {flagged.length === 0 ? (
              <p className="muted small">{s.queueEmpty}</p>
            ) : (
              <ul className="list" data-testid="media-queue">
                {flagged.map((p) => (
                  <li key={p.id} className="flagrow" data-testid="media-flagged">
                    <img
                      className="thumb"
                      src={p.thumbnailUrl}
                      alt={s.photoBy(p.uploaderName, p.day)}
                    />
                    <div className="incident__text">
                      <strong>{s.flag[p.flag ?? 'nudity'] ?? p.flag}</strong>
                      <span className="muted small">
                        {p.uploaderName} · {dayLabel(p)}
                      </span>
                    </div>
                    {staff ? (
                      <div className="missing__actions">
                        <button
                          type="button"
                          className="btn btn--primary btn--sm"
                          disabled={act.isPending}
                          onClick={() =>
                            act.mutate(() => mediaApi.review(org.id, trip.id, p.id, 'clear'))
                          }
                          aria-label={s.approveOf(p.uploaderName)}
                        >
                          <Icons.check /> {s.approve}
                        </button>
                        <button
                          type="button"
                          className="btn btn--ghost btn--sm"
                          disabled={act.isPending}
                          onClick={() =>
                            act.mutate(() => mediaApi.review(org.id, trip.id, p.id, 'remove'))
                          }
                          aria-label={s.removeOf(p.uploaderName)}
                        >
                          {s.remove}
                        </button>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title={s.album} id="media-album">
            <p className="muted small">{s.albumRule}</p>
            <ul className="list list--plain" data-testid="media-album-counts">
              <li>
                <strong>{approved.length}</strong> {s.approvedCount}
              </li>
              <li>
                <strong>{approved.filter((p) => p.album?.wholeGroup).length}</strong> {s.wholeGroup}
              </li>
              <li>
                <strong>
                  {approved.filter((p) => (p.album?.participationIds.length ?? 0) > 0).length}
                </strong>{' '}
                {s.taggedPeople}
              </li>
            </ul>
            {approved.length > 0 ? (
              <ul className="list" data-testid="media-album">
                {approved.map((p) => (
                  <li key={p.id} className="flagrow">
                    <img
                      className="thumb"
                      src={p.thumbnailUrl}
                      alt={s.photoBy(p.uploaderName, p.day)}
                    />
                    <div className="incident__text">
                      <strong>{albumTagsLabel(p)}</strong>
                      <span className="muted small">
                        {p.uploaderName} · {dayLabel(p)} · {s.byName(p.album?.byName ?? '')}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            ) : null}
          </Card>
        </div>
      </div>
    </SectionPage>
  );
}

function albumTagsLabel(p: Photo): string {
  const names = p.album?.taggedNames ?? [];
  if (p.album?.wholeGroup)
    return names.length ? `${s.wholeGroupTag} · ${names.join(', ')}` : s.wholeGroupTag;
  return names.join(', ');
}

/** One pool photo: the thumbnail, the caption, and the staff actions with the tag panel. */
function LivePhoto({
  photo,
  staff,
  travelers,
  busy,
  onAlbum,
  onUnalbum,
  onDelete,
}: {
  photo: Photo;
  staff: boolean;
  travelers: Participation[];
  busy: boolean;
  onAlbum: (tags: { wholeGroup: boolean; participationIds: string[] }) => void;
  onUnalbum: () => void;
  onDelete: () => void;
}) {
  const [tagging, setTagging] = useState(false);
  const [wholeGroup, setWholeGroup] = useState(photo.album?.wholeGroup ?? false);
  const [ids, setIds] = useState<string[]>(photo.album?.participationIds ?? []);
  const toggle = (id: string) =>
    setIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  const canSave = wholeGroup || ids.length > 0;
  return (
    <figure className="thumb__fig" data-testid={`photo-${photo.status}`}>
      <img
        className="thumb"
        src={photo.thumbnailUrl}
        alt={s.photoBy(photo.uploaderName, photo.day)}
        loading="lazy"
      />
      <figcaption className="small muted">
        {photo.uploaderName} · {dayLabel(photo)}
        {photo.status === 'approved' ? (
          <span className="chip chip--done chip--tiny">{s.inAlbum}</span>
        ) : null}
      </figcaption>
      {staff ? (
        <div className="missing__actions">
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            disabled={busy}
            onClick={() => setTagging((v) => !v)}
            aria-label={
              photo.status === 'approved'
                ? s.changeTagsOf(photo.uploaderName)
                : s.addToAlbumOf(photo.uploaderName)
            }
          >
            {photo.status === 'approved' ? s.changeTags : s.addToAlbum}
          </button>
          {photo.status === 'approved' ? (
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              disabled={busy}
              onClick={onUnalbum}
              aria-label={s.removeFromAlbumOf(photo.uploaderName)}
            >
              {s.removeFromAlbum}
            </button>
          ) : null}
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            disabled={busy}
            onClick={onDelete}
            aria-label={s.deleteOf(photo.uploaderName)}
          >
            {s.delete}
          </button>
        </div>
      ) : photo.mine ? (
        <div className="missing__actions">
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            disabled={busy}
            onClick={onDelete}
          >
            {s.delete}
          </button>
        </div>
      ) : null}
      {tagging ? (
        <form
          className="form"
          aria-label={s.tagPanel(photo.uploaderName)}
          onSubmit={(e) => {
            e.preventDefault();
            if (!canSave) return;
            onAlbum({ wholeGroup, participationIds: ids });
            setTagging(false);
          }}
        >
          <p className="field__hint">{s.tagHint}</p>
          <label className="checklist__item">
            <input
              type="checkbox"
              checked={wholeGroup}
              onChange={(e) => setWholeGroup(e.target.checked)}
            />{' '}
            {s.wholeGroupTag}
          </label>
          {travelers.map((t) => (
            <label key={t.id} className="checklist__item">
              <input type="checkbox" checked={ids.includes(t.id)} onChange={() => toggle(t.id)} />{' '}
              {t.displayName}
            </label>
          ))}
          <div className="field__row field__row--tight">
            <button type="submit" className="btn btn--primary btn--sm" disabled={!canSave || busy}>
              {s.saveTags}
            </button>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => setTagging(false)}
            >
              {s.cancel}
            </button>
          </div>
        </form>
      ) : null}
    </figure>
  );
}

function FixtureMedia() {
  const flagged = mediaFixture.filter((m) => m.state === 'flagged');
  const approved = mediaFixture.filter((m) => m.state === 'approved');
  const pool = mediaFixture.filter((m) => m.state !== 'flagged' && m.state !== 'hidden');
  return (
    <SectionPage
      title={strings.nav.media}
      subtitle={s.subtitle(mediaFixture.length, approved.length, flagged.length)}
    >
      <div className="grid">
        <Card title={s.pool} id="media-pool">
          <div className="thumbs" data-testid="media-pool">
            {pool.map((m) => (
              <figure key={m.id} className="thumb__fig">
                <Thumb hue={m.hue} label={s.photoBy(m.uploader, m.day)} />
                <figcaption className="small muted">
                  {m.uploader}
                  {m.state === 'approved' ? (
                    <span className="chip chip--done chip--tiny">{s.inAlbum}</span>
                  ) : null}
                </figcaption>
              </figure>
            ))}
          </div>
        </Card>
        <div className="stack">
          <Card title={s.queue} id="media-queue">
            <p className="muted small">{s.queueIntro}</p>
            <ul className="list" data-testid="media-queue">
              {flagged.map((m) => (
                <li key={m.id} className="flagrow">
                  <Thumb hue={m.hue} label={s.photoBy(m.uploader, m.day)} />
                  <div className="incident__text">
                    <strong>{s.flag[m.flag ?? 'nudity']}</strong>
                    <span className="muted small">
                      {m.uploader} · {s.day(m.day)}
                    </span>
                  </div>
                  <div className="missing__actions">
                    <button type="button" className="btn btn--primary btn--sm">
                      <Icons.check /> {s.approve}
                    </button>
                    <button type="button" className="btn btn--ghost btn--sm">
                      {s.remove}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
          <Card title={s.album} id="media-album">
            <p className="muted small">{s.albumRule}</p>
            <ul className="list list--plain">
              <li>
                <strong>{approved.length}</strong> {s.approvedCount}
              </li>
              <li>
                <strong>{approved.filter((m) => m.tagged.includes('whole group')).length}</strong>{' '}
                {s.wholeGroup}
              </li>
              <li>
                <strong>{approved.filter((m) => m.tagged.includes('Minji Park')).length}</strong>{' '}
                {s.taggedMinji}
              </li>
            </ul>
          </Card>
        </div>
      </div>
    </SectionPage>
  );
}
