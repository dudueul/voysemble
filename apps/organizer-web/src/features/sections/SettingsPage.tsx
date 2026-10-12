// Copyright 2026- At Day. All rights reserved.
// Settings: organization profile, language (D11), quiet hours and guardian digest hour (D29),
// wrap-up window before crypto-shred (D20), organization members (D21). Live (slice 036) when
// the account has an organization: the profile from `GET /v1/orgs/{orgId}`, one Save per card
// through `PATCH` (owner only; organizers read), the member list from `.../members`. The
// fixture otherwise. The notification lanes and the shred read these settings when built.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  Organization,
  OrganizationProfile,
  OrgMember,
  UpdateOrganizationRequest,
} from '@voysemble/contracts';
import { type FormEvent, type ReactNode, useEffect, useState } from 'react';
import { orgSettings } from '../../fixtures/sections';
import { errorText } from '../../lib/errors';
import {
  org as orgApi,
  orgMembersQuery,
  orgProfileQuery,
  orgsQuery,
  pickActiveOrg,
} from '../../lib/session';
import { strings } from '../../lib/strings';
import { Card, Initials, SectionPage } from './SectionPage';

const s = strings.settings;
const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/;

export function SettingsPage() {
  const orgs = useQuery(orgsQuery);
  const active = orgs.data ? pickActiveOrg(orgs.data) : null;
  if (active) return <LiveSettings org={active} />;
  return <FixtureSettings />;
}

/** One card's save: the mutation, its note, and the owner gate shared by the three forms. */
function useSave(orgId: string, canEdit: boolean) {
  const qc = useQueryClient();
  const [note, setNote] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: (body: UpdateOrganizationRequest) => orgApi.update(orgId, body),
    onSuccess: (profile) => {
      setNote(s.saved);
      qc.setQueryData(orgProfileQuery(orgId).queryKey, profile);
      // The shell shows the organization name from the list.
      void qc.invalidateQueries({ queryKey: orgsQuery.queryKey });
    },
    onError: (e) => setNote(errorText(e, s.saveFailed)),
  });
  return { save, note, setNote, canEdit };
}

function SaveRow({
  saving,
  note,
  canEdit,
  testId,
}: {
  saving: boolean;
  note: string | null;
  canEdit: boolean;
  testId: string;
}) {
  return (
    <div className="field__row field__row--tight">
      <button type="submit" className="btn btn--primary btn--sm" disabled={saving || !canEdit}>
        {saving ? s.saving : s.save}
      </button>
      <span className="field__hint" role="status" data-testid={testId}>
        {!canEdit ? s.ownerOnly : (note ?? '')}
      </span>
    </div>
  );
}

function ProfileForm({
  orgId,
  profile,
  canEdit,
}: {
  orgId: string;
  profile: OrganizationProfile;
  canEdit: boolean;
}) {
  const [name, setName] = useState(profile.name);
  const [locale, setLocale] = useState<'ko' | 'en'>(profile.defaultLocale);
  const [timeZone, setTimeZone] = useState(profile.settings.timeZone);
  // The inputs follow the server after a save elsewhere without remounting (no lost "Saved.").
  useEffect(() => setName(profile.name), [profile.name]);
  useEffect(() => setLocale(profile.defaultLocale), [profile.defaultLocale]);
  useEffect(() => setTimeZone(profile.settings.timeZone), [profile.settings.timeZone]);
  const { save, note, canEdit: editable } = useSave(orgId, canEdit);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate({
      name: name.trim(),
      defaultLocale: locale,
      settings: { timeZone: timeZone.trim() },
    });
  };
  return (
    <form className="form" onSubmit={submit} aria-label={s.profile}>
      <label className="field">
        <span className="field__label">{s.orgName}</span>
        <input
          className="field__input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          maxLength={120}
        />
      </label>
      <div className="field__row">
        <label className="field">
          <span className="field__label">{s.language}</span>
          <select
            className="field__input"
            value={locale}
            onChange={(e) => setLocale(e.target.value === 'en' ? 'en' : 'ko')}
          >
            <option value="ko">한국어</option>
            <option value="en">English</option>
          </select>
        </label>
        <label className="field">
          <span className="field__label">{s.timezone}</span>
          <input
            className="field__input"
            value={timeZone}
            onChange={(e) => setTimeZone(e.target.value)}
            required
          />
          <span className="field__hint">{s.timezoneHint}</span>
        </label>
      </div>
      <SaveRow
        saving={save.isPending}
        note={note}
        canEdit={editable}
        testId="settings-profile-status"
      />
    </form>
  );
}

function NotificationForm({
  orgId,
  profile,
  canEdit,
}: {
  orgId: string;
  profile: OrganizationProfile;
  canEdit: boolean;
}) {
  const st = profile.settings;
  const [from, setFrom] = useState(st.quietHours.from);
  const [to, setTo] = useState(st.quietHours.to);
  const [digest, setDigest] = useState(st.guardianDigestAt);
  useEffect(() => setFrom(st.quietHours.from), [st.quietHours.from]);
  useEffect(() => setTo(st.quietHours.to), [st.quietHours.to]);
  useEffect(() => setDigest(st.guardianDigestAt), [st.guardianDigestAt]);
  const { save, note, setNote, canEdit: editable } = useSave(orgId, canEdit);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (![from, to, digest].every((v) => CLOCK.test(v))) {
      setNote(s.badClock);
      return;
    }
    save.mutate({ settings: { quietHours: { from, to }, guardianDigestAt: digest } });
  };
  return (
    <form className="form" onSubmit={submit} aria-label={s.notifications} noValidate>
      <div className="field__row">
        <label className="field">
          <span className="field__label">{s.quietFrom}</span>
          <input
            className="field__input"
            type="time"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            required
          />
        </label>
        <label className="field">
          <span className="field__label">{s.quietTo}</span>
          <input
            className="field__input"
            type="time"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            required
          />
        </label>
        <label className="field">
          <span className="field__label">{s.digestHour}</span>
          <input
            className="field__input"
            type="time"
            value={digest}
            onChange={(e) => setDigest(e.target.value)}
            required
          />
        </label>
      </div>
      <p className="muted small">{s.notifRule}</p>
      <SaveRow
        saving={save.isPending}
        note={note}
        canEdit={editable}
        testId="settings-notif-status"
      />
    </form>
  );
}

function RetentionForm({
  orgId,
  profile,
  canEdit,
}: {
  orgId: string;
  profile: OrganizationProfile;
  canEdit: boolean;
}) {
  const [days, setDays] = useState(String(profile.settings.wrapUpDays));
  useEffect(() => setDays(String(profile.settings.wrapUpDays)), [profile.settings.wrapUpDays]);
  const { save, note, setNote, canEdit: editable } = useSave(orgId, canEdit);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const n = Number(days);
    if (!Number.isInteger(n) || n < 30 || n > 365) {
      setNote(s.badWindow);
      return;
    }
    save.mutate({ settings: { wrapUpDays: n } });
  };
  return (
    <form className="form" onSubmit={submit} aria-label={s.retention} noValidate>
      <label className="field">
        <span className="field__label">{s.wrapUp}</span>
        <input
          className="field__input"
          type="number"
          min={30}
          max={365}
          value={days}
          onChange={(e) => setDays(e.target.value)}
          required
        />
        <span className="field__hint">{s.wrapUpHint}</span>
      </label>
      <SaveRow
        saving={save.isPending}
        note={note}
        canEdit={editable}
        testId="settings-retention-status"
      />
    </form>
  );
}

function MemberRow({ m }: { m: OrgMember }) {
  const local = m.email.split('@')[0] ?? m.email;
  return (
    <li className="person" data-testid={`member-${m.role}`}>
      <Initials name={local.replace(/[._-]+/g, ' ')} />
      <span className="channel__text">
        <span>
          {m.email}
          {m.you ? (
            <span className="chip chip--active" style={{ marginLeft: 8 }}>
              {s.you}
            </span>
          ) : null}
        </span>
        <span className="muted small">{m.joinedAt.slice(0, 10)}</span>
      </span>
      <span className="chip chip--scheduled">{s.role[m.role] ?? m.role}</span>
    </li>
  );
}

function LiveMembers({ orgId }: { orgId: string }) {
  const members = useQuery(orgMembersQuery(orgId));
  if (members.isPending) {
    return (
      <p className="muted small" role="status">
        {s.loading}
      </p>
    );
  }
  if (members.isError) {
    return (
      <p className="muted small" role="status">
        {errorText(members.error, s.membersLoadFailed)}
      </p>
    );
  }
  return (
    <>
      <ul className="list" data-testid="member-list">
        {members.data.map((m) => (
          <MemberRow key={m.accountId} m={m} />
        ))}
      </ul>
      {members.data.length <= 1 ? <p className="muted small">{s.noMembers}</p> : null}
      <p className="muted small">{s.memberRule}</p>
    </>
  );
}

function LiveSettings({ org }: { org: Organization }) {
  const profile = useQuery(orgProfileQuery(org.id));
  const live = <span className="chip chip--active">{strings.dashboard.live}</span>;
  let body: ReactNode;
  if (profile.isPending) {
    body = (
      <p className="state__body" role="status">
        {s.loading}
      </p>
    );
  } else if (profile.isError) {
    body = (
      <p className="state__body" role="status">
        {errorText(profile.error, s.loadFailed)}
      </p>
    );
  } else {
    const p = profile.data;
    const canEdit = p.role === 'owner';
    body = (
      <div className="grid">
        <div className="stack">
          <Card title={s.profile} id="set-profile">
            <ProfileForm orgId={org.id} profile={p} canEdit={canEdit} />
          </Card>
          <Card title={s.notifications} id="set-notif">
            <NotificationForm orgId={org.id} profile={p} canEdit={canEdit} />
          </Card>
          <Card title={s.retention} id="set-retention">
            <RetentionForm orgId={org.id} profile={p} canEdit={canEdit} />
          </Card>
        </div>
        <Card title={s.members} id="set-members">
          <LiveMembers orgId={org.id} />
        </Card>
      </div>
    );
  }
  return (
    <SectionPage
      title={strings.nav.settings}
      subtitle={s.liveSubtitle}
      sample={false}
      actions={live}
    >
      {body}
    </SectionPage>
  );
}

function FixtureSettings() {
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
