// Copyright 2026- At Day. All rights reserved.
// Messages & announcements (gallery #27). Fixed channels (D22), announcements with ack progress,
// unacked list and nudge (D16). Composer is visual only in this slice.

import { Icons } from '../../app/shell/icons';
import { FROZEN_NOW } from '../../fixtures/korea-concert-tour';
import { announcements, channels } from '../../fixtures/sections';
import { relativeTo } from '../../lib/format';
import { strings } from '../../lib/strings';
import { Card, Meter, SectionPage } from './SectionPage';

const s = strings.communication;

export function CommunicationPage() {
  const unread = channels.reduce((n, c) => n + c.unread, 0);
  return (
    <SectionPage
      title={strings.nav.communication}
      subtitle={s.subtitle(unread)}
      actions={
        <button type="button" className="btn btn--primary btn--sm">
          <Icons.plus /> {s.newAnnouncement}
        </button>
      }
      className="comm"
    >
      <div className="grid">
        <div className="stack">
          <Card title={s.announcements} id="comm-ann">
            <ul className="list" data-testid="announcement-list">
              {announcements.map((a) => (
                <li key={a.id} className="ann">
                  <div className="ann__head">
                    <strong>{a.title}</strong>
                    <span className="muted small">{relativeTo(FROZEN_NOW, a.publishedAt)}</span>
                  </div>
                  <p className="ann__body">{a.body}</p>
                  <div className="ann__meta">
                    {a.requiresAck ? (
                      <span className="chip chip--scheduled">{s.requiresAck}</span>
                    ) : null}
                    {a.sharedWithGuardians ? (
                      <span className="chip chip--scheduled">{s.sharedWithGuardians}</span>
                    ) : null}
                    {a.translated ? (
                      <span className="chip chip--scheduled">{s.machineKo}</span>
                    ) : null}
                  </div>
                  {a.requiresAck ? (
                    <div className="ann__ack">
                      <Meter
                        value={a.acknowledged}
                        max={a.total}
                        tone={a.acknowledged === a.total ? 'ok' : 'warn'}
                        label={s.ackLabel(a.acknowledged, a.total)}
                      />
                      <span className="small" data-testid={`ack-${a.id}`}>
                        {a.acknowledged}/{a.total}
                      </span>
                      {a.unacked.length ? (
                        <span className="small muted">
                          {s.unacked}: {a.unacked.join(', ')}
                          {' · '}
                          <button type="button" className="linkbtn">
                            {s.nudge}
                          </button>
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          </Card>
          <Card title={s.composer} id="comm-compose">
            <div className="form">
              <label className="field">
                <span className="field__label">{s.title}</span>
                <input className="field__input" defaultValue="" placeholder={s.titlePlaceholder} />
              </label>
              <label className="field">
                <span className="field__label">{s.body}</span>
                <textarea className="field__input field__textarea" rows={3} defaultValue="" />
              </label>
              <div className="field__row">
                <label className="radio">
                  <input type="checkbox" defaultChecked /> {s.requiresAck}
                </label>
                <label className="radio">
                  <input type="checkbox" /> {s.sharedWithGuardians}
                </label>
                <label className="radio">
                  <input type="checkbox" defaultChecked /> {s.autoTranslate}
                </label>
              </div>
              <div className="form__actions">
                <button type="button" className="btn btn--primary" disabled>
                  {s.publish}
                </button>
              </div>
            </div>
          </Card>
        </div>
        <Card title={s.channels} id="comm-channels">
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
          <p className="muted small">{s.channelRule}</p>
        </Card>
      </div>
    </SectionPage>
  );
}
