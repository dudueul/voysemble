// Copyright 2026- At Day. All rights reserved.
//
// First-run checklist (D26): organization -> trip -> roster -> invites. Every step talks to the
// real API through src/lib/session.ts. Done steps collapse into a summary line; the first
// undone step is open. Nothing here is a fixture: an empty org shows an empty checklist.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { IssuedInvite, Organization, Participation, Trip } from '@voysemble/contracts';
import { type FormEvent, useState } from 'react';
import { Icons } from '../../app/shell/icons';
import { ApiError } from '../../lib/api-client';
import {
  orgsQuery,
  pickActiveOrg,
  rosterQuery,
  setup,
  tripsQuery,
  writeActiveOrgId,
} from '../../lib/session';
import { strings } from '../../lib/strings';

const s = strings.setup;

function ErrorLine({ error }: { error: unknown }) {
  if (!error) return null;
  const ref = error instanceof ApiError ? error.correlationId : 'none';
  const msg = error instanceof Error ? error.message : String(error);
  return (
    <p className="field__error" role="alert">
      {msg} ({strings.auth.reference(ref)})
    </p>
  );
}

function Step({
  n,
  title,
  done,
  summary,
  open,
  children,
}: {
  n: number;
  title: string;
  done: boolean;
  summary?: string | undefined;
  open: boolean;
  children?: React.ReactNode;
}) {
  return (
    <section
      className={`step card${done ? ' step--done' : ''}${open ? ' step--open' : ''}`}
      aria-labelledby={`step-${n}`}
      data-testid={`step-${n}`}
      data-state={done ? 'done' : open ? 'open' : 'locked'}
    >
      <header className="step__head">
        <span className="step__badge" aria-hidden="true">
          {done ? <Icons.check /> : n}
        </span>
        <div className="step__titles">
          <h2 className="card__title" id={`step-${n}`}>
            {title}
          </h2>
          {summary ? <p className="step__summary">{summary}</p> : null}
        </div>
        <span className="chip chip--scheduled">
          {done ? s.done : open ? s.inProgress : s.locked}
        </span>
      </header>
      {open ? <div className="card__body">{children}</div> : null}
    </section>
  );
}

/* ---------- Step 1: organization ---------- */

function OrgStep({ onCreated }: { onCreated: (org: Organization) => void }) {
  const [name, setName] = useState('');
  const [locale, setLocale] = useState<'ko' | 'en'>('ko');
  const create = useMutation({
    mutationFn: () => setup.createOrg(name.trim(), locale),
    onSuccess: onCreated,
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (name.trim()) create.mutate();
  };
  return (
    <form className="form" onSubmit={submit}>
      <label className="field">
        <span className="field__label">{s.orgName}</span>
        <input
          className="field__input"
          name="orgName"
          required
          maxLength={120}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={s.orgNamePlaceholder}
        />
      </label>
      <fieldset className="field">
        <legend className="field__label">{s.language}</legend>
        <div className="field__row">
          <label className="radio">
            <input
              type="radio"
              name="locale"
              checked={locale === 'ko'}
              onChange={() => setLocale('ko')}
            />
            한국어
          </label>
          <label className="radio">
            <input
              type="radio"
              name="locale"
              checked={locale === 'en'}
              onChange={() => setLocale('en')}
            />
            English
          </label>
        </div>
      </fieldset>
      <ErrorLine error={create.error} />
      <div className="form__actions">
        <button type="submit" className="btn btn--primary" disabled={create.isPending}>
          {s.createOrg}
        </button>
      </div>
    </form>
  );
}

/* ---------- Step 2: trip ---------- */

const SAMPLE_TRIP = {
  name: 'Korea Concert Tour 2026',
  startsOn: '2026-12-26',
  endsOn: '2027-01-07',
  timezone: 'Asia/Seoul',
};

function TripStep({ org, onCreated }: { org: Organization; onCreated: (t: Trip) => void }) {
  const [form, setForm] = useState({ name: '', startsOn: '', endsOn: '', timezone: 'Asia/Seoul' });
  const create = useMutation({
    mutationFn: () => setup.createTrip(org.id, form),
    onSuccess: onCreated,
  });
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));
  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault();
        create.mutate();
      }}
    >
      <div className="field__row">
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={() => setForm(SAMPLE_TRIP)}
        >
          {s.useSampleTrip}
        </button>
        <span className="field__hint">{s.sampleTripHint}</span>
      </div>
      <label className="field">
        <span className="field__label">{s.tripName}</span>
        <input
          className="field__input"
          name="tripName"
          required
          maxLength={160}
          value={form.name}
          onChange={set('name')}
        />
      </label>
      <div className="field__row">
        <label className="field">
          <span className="field__label">{s.startsOn}</span>
          <input
            className="field__input"
            type="date"
            name="startsOn"
            required
            value={form.startsOn}
            onChange={set('startsOn')}
          />
        </label>
        <label className="field">
          <span className="field__label">{s.endsOn}</span>
          <input
            className="field__input"
            type="date"
            name="endsOn"
            required
            value={form.endsOn}
            onChange={set('endsOn')}
          />
        </label>
        <label className="field">
          <span className="field__label">{s.timezone}</span>
          <input
            className="field__input"
            name="timezone"
            required
            value={form.timezone}
            onChange={set('timezone')}
          />
        </label>
      </div>
      <ErrorLine error={create.error} />
      <div className="form__actions">
        <button type="submit" className="btn btn--primary" disabled={create.isPending}>
          {s.createTrip}
        </button>
      </div>
    </form>
  );
}

/* ---------- Step 3: roster ---------- */

const CSV_TEMPLATE = 'name,group,guardian_name,guardian_contact\n';

function RosterStep({
  org,
  trip,
  roster,
  onChanged,
}: {
  org: Organization;
  trip: Trip;
  roster: Participation[];
  onChanged: () => void;
}) {
  const [csv, setCsv] = useState(CSV_TEMPLATE);
  const [leader, setLeader] = useState({ name: '', group: '' });
  const importRoster = useMutation({
    mutationFn: () => setup.importRoster(org.id, trip.id, csv),
    onSuccess: () => {
      setCsv(CSV_TEMPLATE);
      onChanged();
    },
  });
  const addLeader = useMutation({
    mutationFn: () =>
      setup.addLeader(org.id, trip.id, leader.name.trim(), leader.group.trim() || null),
    onSuccess: () => {
      setLeader({ name: '', group: '' });
      onChanged();
    },
  });
  const onFile = async (file: File | undefined) => {
    if (file) setCsv(await file.text());
  };
  const counts = {
    traveler: roster.filter((p) => p.role === 'traveler').length,
    guardian: roster.filter((p) => p.role === 'guardian').length,
    leader: roster.filter((p) => p.role === 'leader').length,
  };
  return (
    <div className="setup__two">
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          importRoster.mutate();
        }}
      >
        <label className="field">
          <span className="field__label">{s.csvFile}</span>
          <input
            className="field__input"
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => void onFile(e.target.files?.[0])}
          />
        </label>
        <label className="field">
          <span className="field__label">{s.csvText}</span>
          <textarea
            className="field__input field__textarea"
            name="csv"
            rows={8}
            spellCheck={false}
            value={csv}
            onChange={(e) => setCsv(e.target.value)}
          />
          <span className="field__hint">{s.csvHint}</span>
        </label>
        {importRoster.isSuccess ? (
          <p className="field__hint" role="status">
            {s.imported(importRoster.data.created, importRoster.data.skipped.length)}
          </p>
        ) : null}
        <ErrorLine error={importRoster.error} />
        <div className="form__actions">
          <button
            type="submit"
            className="btn btn--primary"
            disabled={importRoster.isPending || csv.trim() === CSV_TEMPLATE.trim()}
          >
            {s.importRoster}
          </button>
        </div>
      </form>
      <div className="form">
        <h3 className="field__label">{s.rosterSoFar}</h3>
        <dl className="kv" data-testid="roster-counts">
          <dt>{s.travelers}</dt>
          <dd data-testid="count-traveler">{counts.traveler}</dd>
          <dt>{s.guardians}</dt>
          <dd data-testid="count-guardian">{counts.guardian}</dd>
          <dt>{s.leaders}</dt>
          <dd data-testid="count-leader">{counts.leader}</dd>
        </dl>
        <form
          className="form"
          onSubmit={(e) => {
            e.preventDefault();
            if (leader.name.trim()) addLeader.mutate();
          }}
        >
          <div className="field__row">
            <label className="field">
              <span className="field__label">{s.leaderName}</span>
              <input
                className="field__input"
                name="leaderName"
                value={leader.name}
                onChange={(e) => setLeader((l) => ({ ...l, name: e.target.value }))}
              />
            </label>
            <label className="field">
              <span className="field__label">{s.leaderGroup}</span>
              <input
                className="field__input"
                name="leaderGroup"
                value={leader.group}
                onChange={(e) => setLeader((l) => ({ ...l, group: e.target.value }))}
              />
            </label>
          </div>
          <ErrorLine error={addLeader.error} />
          <div className="form__actions">
            <button type="submit" className="btn btn--ghost btn--sm" disabled={addLeader.isPending}>
              {s.addLeader}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ---------- Step 4: invites ---------- */

export function invitesToCsv(invites: IssuedInvite[]): string {
  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return [
    'name,role,code,expires_at',
    ...invites.map((i) => [i.displayName, i.role, i.code, i.expiresAt].map(esc).join(',')),
  ].join('\n');
}

function InvitesStep({
  org,
  trip,
  roster,
}: {
  org: Organization;
  trip: Trip;
  roster: Participation[];
}) {
  const qc = useQueryClient();
  const issue = useMutation({
    mutationFn: () => setup.issueInvites(org.id, trip.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: rosterQuery(org.id, trip.id).queryKey }),
  });
  const unbound = roster.filter((p) => !p.accountId).length;
  const invites = issue.data?.invites ?? [];
  const download = () => {
    const blob = new Blob([invitesToCsv(invites)], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `voysemble-invites-${trip.id.slice(0, 8)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  return (
    <div className="form">
      <p className="page__subtitle">{s.invitesIntro(unbound)}</p>
      <ErrorLine error={issue.error} />
      <div className="field__row">
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => issue.mutate()}
          disabled={issue.isPending || unbound === 0}
        >
          {s.issueInvites}
        </button>
        {invites.length ? (
          <button type="button" className="btn btn--ghost" onClick={download}>
            {s.downloadCsv}
          </button>
        ) : null}
      </div>
      {issue.isSuccess ? (
        <>
          <p className="field__hint" role="status">
            {invites.length ? s.issued(invites.length) : s.nothingToIssue}
          </p>
          {invites.length ? (
            <table className="table" data-testid="invite-table">
              <thead>
                <tr>
                  <th>{s.colName}</th>
                  <th>{s.colRole}</th>
                  <th>{s.colCode}</th>
                  <th>{s.colExpires}</th>
                </tr>
              </thead>
              <tbody>
                {invites.map((i) => (
                  <tr key={i.participationId}>
                    <td>{i.displayName}</td>
                    <td>{i.role}</td>
                    <td>
                      <code className="code">{i.code}</code>
                    </td>
                    <td>{i.expiresAt.slice(0, 10)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

/* ---------- Page ---------- */

export function SetupPage() {
  const qc = useQueryClient();
  const orgs = useQuery(orgsQuery);
  const org = orgs.data ? pickActiveOrg(orgs.data) : null;
  const trips = useQuery({ ...tripsQuery(org?.id ?? ''), enabled: Boolean(org) });
  const trip = trips.data?.[0] ?? null;
  const roster = useQuery({
    ...rosterQuery(org?.id ?? '', trip?.id ?? ''),
    enabled: Boolean(org && trip),
  });
  const people = roster.data ?? [];

  if (orgs.isPending || (org && trips.isPending) || (org && trip && roster.isPending)) {
    return (
      <main className="page" aria-busy="true">
        <h1 className="page__title">{s.title}</h1>
        <p className="page__subtitle" role="status">
          {strings.states.loading}
        </p>
      </main>
    );
  }
  if (orgs.isError || trips.isError || roster.isError) {
    return (
      <main className="page">
        <h1 className="page__title">{s.title}</h1>
        <div className="card">
          <ErrorLine error={orgs.error ?? trips.error ?? roster.error} />
        </div>
      </main>
    );
  }

  const step1 = Boolean(org);
  const step2 = Boolean(trip);
  const step3 = people.some((p) => p.role !== 'leader');
  const invited = people.filter((p) => p.accountId).length;
  const openStep = !step1 ? 1 : !step2 ? 2 : !step3 ? 3 : 4;

  return (
    <main className="page setup">
      <header className="page__header">
        <div>
          <h1 className="page__title">{s.title}</h1>
          <p className="page__subtitle">{s.subtitle}</p>
        </div>
        <p className="page__meta" data-testid="setup-progress">
          {s.progress([step1, step2, step3, invited > 0].filter(Boolean).length)}
        </p>
      </header>

      <Step n={1} title={s.step1} done={step1} summary={org?.name} open={openStep === 1}>
        <OrgStep
          onCreated={(created) => {
            writeActiveOrgId(created.id);
            void qc.invalidateQueries({ queryKey: orgsQuery.queryKey });
            void qc.invalidateQueries({ queryKey: ['me'] });
          }}
        />
      </Step>

      <Step
        n={2}
        title={s.step2}
        done={step2}
        summary={trip ? `${trip.name} · ${trip.startsOn} → ${trip.endsOn}` : undefined}
        open={openStep === 2}
      >
        {org ? (
          <TripStep
            org={org}
            onCreated={() => void qc.invalidateQueries({ queryKey: tripsQuery(org.id).queryKey })}
          />
        ) : null}
      </Step>

      <Step
        n={3}
        title={s.step3}
        done={step3}
        summary={step3 ? s.rosterSummary(people.length) : undefined}
        open={openStep === 3 || openStep === 4}
      >
        {org && trip ? (
          <RosterStep
            org={org}
            trip={trip}
            roster={people}
            onChanged={() =>
              void qc.invalidateQueries({ queryKey: rosterQuery(org.id, trip.id).queryKey })
            }
          />
        ) : null}
      </Step>

      <Step
        n={4}
        title={s.step4}
        done={invited > 0}
        summary={invited > 0 ? s.joined(invited, people.length) : undefined}
        open={openStep === 4}
      >
        {org && trip ? <InvitesStep org={org} trip={trip} roster={people} /> : null}
      </Step>
    </main>
  );
}
