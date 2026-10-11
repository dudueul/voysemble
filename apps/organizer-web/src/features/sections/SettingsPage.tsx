// Copyright 2026- At Day. All rights reserved.
// Settings: organization profile, language (D11), quiet hours and guardian digest hour (D29),
// wrap-up window before crypto-shred (D20), organization members (D21). Visual only; the forms
// save nothing yet.

import { orgSettings } from '../../fixtures/sections';
import { strings } from '../../lib/strings';
import { Card, Initials, SectionPage } from './SectionPage';

const s = strings.settings;

export function SettingsPage() {
  return (
    <SectionPage title={strings.nav.settings} subtitle={s.subtitle}>
      <div className="grid">
        <div className="stack">
          <Card title={s.profile} id="set-profile">
            <div className="form">
              <label className="field">
                <span className="field__label">{s.orgName}</span>
                <input className="field__input" defaultValue={orgSettings.name} />
              </label>
              <div className="field__row">
                <label className="field">
                  <span className="field__label">{s.language}</span>
                  <select className="field__input" defaultValue={orgSettings.defaultLocale}>
                    <option value="ko">한국어</option>
                    <option value="en">English</option>
                  </select>
                </label>
                <label className="field">
                  <span className="field__label">{s.timezone}</span>
                  <input className="field__input" defaultValue={orgSettings.timezone} />
                </label>
              </div>
            </div>
          </Card>
          <Card title={s.notifications} id="set-notif">
            <div className="form">
              <div className="field__row">
                <label className="field">
                  <span className="field__label">{s.quietFrom}</span>
                  <input
                    className="field__input"
                    type="time"
                    defaultValue={orgSettings.quietHours.from}
                  />
                </label>
                <label className="field">
                  <span className="field__label">{s.quietTo}</span>
                  <input
                    className="field__input"
                    type="time"
                    defaultValue={orgSettings.quietHours.to}
                  />
                </label>
                <label className="field">
                  <span className="field__label">{s.digestHour}</span>
                  <input
                    className="field__input"
                    type="time"
                    defaultValue={orgSettings.guardianDigestHour}
                  />
                </label>
              </div>
              <p className="muted small">{s.notifRule}</p>
            </div>
          </Card>
          <Card title={s.retention} id="set-retention">
            <div className="form">
              <label className="field">
                <span className="field__label">{s.wrapUp}</span>
                <input
                  className="field__input"
                  type="number"
                  min={30}
                  max={365}
                  defaultValue={orgSettings.wrapUpDays}
                />
                <span className="field__hint">{s.wrapUpHint}</span>
              </label>
            </div>
          </Card>
        </div>
        <Card title={s.members} id="set-members">
          <ul className="list" data-testid="member-list">
            {orgSettings.members.map((m) => (
              <li key={m.email} className="person">
                <Initials name={m.name} />
                <span className="channel__text">
                  <span>{m.name}</span>
                  <span className="muted small">{m.email}</span>
                </span>
                <span className="chip chip--scheduled">{m.role}</span>
              </li>
            ))}
          </ul>
          <p className="muted small">{s.memberRule}</p>
        </Card>
      </div>
    </SectionPage>
  );
}
