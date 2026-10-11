// Copyright 2026- At Day. All rights reserved.
// Media: trip pool, moderation queue, guardian album (gallery #12/#14, D18). Thumbnails are
// hue-tinted placeholders: no licensed photos yet (doc 01 §15). Flags come from the fixture, as
// the moderation model would produce them; a leader approves or removes.

import { Icons } from '../../app/shell/icons';
import { media } from '../../fixtures/sections';
import { strings } from '../../lib/strings';
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
  const flagged = media.filter((m) => m.state === 'flagged');
  const approved = media.filter((m) => m.state === 'approved');
  const pool = media.filter((m) => m.state !== 'flagged' && m.state !== 'hidden');
  return (
    <SectionPage
      title={strings.nav.media}
      subtitle={s.subtitle(media.length, approved.length, flagged.length)}
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
