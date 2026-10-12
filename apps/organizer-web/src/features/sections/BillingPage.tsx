// Copyright 2026- At Day. All rights reserved.
// Billing (D23): the organizer's Voysemble plan (Stripe, web only) and the traveler fee ledger
// that the organizer records; nothing here collects money from guardians.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Currency, FeeLedger, FeeRow } from '@voysemble/contracts';
import { type FormEvent, useEffect, useState } from 'react';
import { Icons } from '../../app/shell/icons';
import { ledger, ledgerTotals, plan } from '../../fixtures/sections';
import { errorText } from '../../lib/errors';
import { fees as feesApi, feesQuery, formatMoney, parseMoney, toMajor } from '../../lib/fees-api';
import { orgsQuery, pickActiveOrg, tripsQuery, useActiveTrip } from '../../lib/session';
import { strings } from '../../lib/strings';
import { Card, formatKrw, Meter, SectionPage } from './SectionPage';

const s = strings.billing;

/** One traveler's row with an editable paid amount (slice 027). */
function LedgerRowLive({ orgId, tripId, row }: { orgId: string; tripId: string; row: FeeRow }) {
  const qc = useQueryClient();
  const [paid, setPaid] = useState(toMajor(row.paidMinor, row.currency));
  const [note, setNote] = useState<string | null>(null);
  // The input follows the server (a save, a CSV import) without remounting the row, so the
  // "Saved" note survives the refetch (CI run 38199495526 caught the remount race).
  const server = toMajor(row.paidMinor, row.currency);
  useEffect(() => setPaid(server), [server]);
  const save = useMutation({
    mutationFn: (paidMinor: number) =>
      feesApi.update(orgId, tripId, row.participationId, { paidMinor }),
    onSuccess: () => {
      setNote(s.saved(row.displayName));
      void qc.invalidateQueries({ queryKey: feesQuery(orgId, tripId).queryKey });
    },
    onError: (e) => setNote(errorText(e, s.saveFailed)),
  });
  const submit = () => {
    const minor = parseMoney(paid, row.currency);
    if (minor === null) {
      setNote(s.badAmount);
      return;
    }
    save.mutate(minor);
  };
  return (
    <tr data-testid={`fee-${row.participationId}`}>
      <td>{row.displayName}</td>
      <td>{row.groupName ?? '—'}</td>
      <td>{formatMoney(row.amountDueMinor, row.currency)}</td>
      <td>
        <span className="field__row field__row--tight">
          <input
            className="field__input field__input--sm"
            inputMode="decimal"
            aria-label={s.paidInput(row.displayName)}
            value={paid}
            onChange={(e) => setPaid(e.target.value)}
          />
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            aria-label={s.savePaid(row.displayName)}
            disabled={save.isPending}
            onClick={submit}
          >
            <Icons.check />
          </button>
        </span>
        {note ? (
          <span className="small muted" role="status">
            {note}
          </span>
        ) : null}
      </td>
      <td className="muted">{row.dueOn ?? '—'}</td>
      <td>
        <span className={`chip chip--fee-${row.status}`}>{s.status[row.status]}</span>
      </td>
    </tr>
  );
}

function ApplyFeeForm({
  orgId,
  tripId,
  currency,
  withoutFee,
}: {
  orgId: string;
  tripId: string;
  currency: Currency;
  withoutFee: number;
}) {
  const qc = useQueryClient();
  const [amount, setAmount] = useState('');
  const [cur, setCur] = useState<Currency>(currency);
  const [dueOn, setDueOn] = useState('');
  const [onlyWithoutFee, setOnlyWithoutFee] = useState(true);
  const [note, setNote] = useState<string | null>(null);
  const apply = useMutation({
    mutationFn: (amountDueMinor: number) =>
      feesApi.apply(orgId, tripId, {
        amountDueMinor,
        currency: cur,
        dueOn: dueOn || null,
        onlyWithoutFee,
      }),
    onSuccess: (ledger) => {
      setNote(s.applied(ledger.rows.length));
      void qc.invalidateQueries({ queryKey: feesQuery(orgId, tripId).queryKey });
    },
    onError: (e) => setNote(errorText(e, s.saveFailed)),
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const minor = parseMoney(amount, cur);
    if (minor === null) {
      setNote(s.badAmount);
      return;
    }
    apply.mutate(minor);
  };
  return (
    <form className="form form--inline" onSubmit={submit} aria-label={s.setFee}>
      <p className="field__hint">
        {s.setFeeHint} {withoutFee > 0 ? s.withoutFee(withoutFee) : ''}
      </p>
      <div className="field__row">
        <label className="field">
          <span className="field__label">{s.amount}</span>
          <input
            className="field__input"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
        </label>
        <label className="field">
          <span className="field__label">{s.currency}</span>
          <select
            className="field__input"
            value={cur}
            onChange={(e) => setCur(e.target.value as Currency)}
          >
            {(['KRW', 'USD', 'EUR', 'JPY'] as const).map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field__label">{s.dueOn}</span>
          <input
            className="field__input"
            type="date"
            value={dueOn}
            onChange={(e) => setDueOn(e.target.value)}
          />
        </label>
      </div>
      <div className="field__row">
        <label className="radio">
          <input
            type="checkbox"
            checked={onlyWithoutFee}
            onChange={(e) => setOnlyWithoutFee(e.target.checked)}
          />{' '}
          {s.onlyWithoutFee}
        </label>
        <button type="submit" className="btn btn--primary btn--sm" disabled={apply.isPending}>
          {s.applyFee}
        </button>
      </div>
      {note ? (
        <p className="field__hint" role="status" data-testid="fee-apply-status">
          {note}
        </p>
      ) : null}
    </form>
  );
}

function ImportForm({ orgId, tripId }: { orgId: string; tripId: string }) {
  const qc = useQueryClient();
  const [csv, setCsv] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const run = useMutation({
    mutationFn: () => feesApi.import(orgId, tripId, csv),
    onSuccess: (r) => {
      setNote(s.imported(r.applied, r.unmatched, r.skipped.length));
      void qc.invalidateQueries({ queryKey: feesQuery(orgId, tripId).queryKey });
    },
    onError: (e) => setNote(errorText(e, s.importFailed)),
  });
  return (
    <Card title={s.importTitle} id="bill-import">
      <p className="field__hint">{s.importHint}</p>
      <label className="field">
        <span className="field__label">{s.csvLabel}</span>
        <textarea
          className="field__input field__textarea"
          rows={4}
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
        />
      </label>
      <div className="form__actions">
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          disabled={run.isPending || !csv.trim()}
          onClick={() => run.mutate()}
        >
          {s.importRows}
        </button>
      </div>
      {note ? (
        <p className="field__hint" role="status" data-testid="fee-import-status">
          {note}
        </p>
      ) : null}
    </Card>
  );
}

function LiveLedger({
  orgId,
  tripId,
  ledger,
}: {
  orgId: string;
  tripId: string;
  ledger: FeeLedger;
}) {
  const t = ledger.totals;
  return (
    <>
      <div className="ledger__summary">
        <Meter
          value={t.collectedMinor}
          max={Math.max(t.expectedMinor, 1)}
          tone="ok"
          label={s.collected(
            formatMoney(t.collectedMinor, ledger.currency),
            formatMoney(t.expectedMinor, ledger.currency),
          )}
        />
        <span className="small" data-testid="ledger-collected">
          {s.collected(
            formatMoney(t.collectedMinor, ledger.currency),
            formatMoney(t.expectedMinor, ledger.currency),
          )}
        </span>
        <span className="muted small" data-testid="ledger-counts">
          {s.counts(t.paid, t.partial, t.unpaid, t.refunded)}
        </span>
      </div>
      <ApplyFeeForm
        orgId={orgId}
        tripId={tripId}
        currency={ledger.currency}
        withoutFee={ledger.withoutFee}
      />
      {ledger.rows.length === 0 ? (
        <p className="state__body" role="status">
          {s.empty}
        </p>
      ) : (
        <table className="table" data-testid="ledger-table">
          <thead>
            <tr>
              <th>{s.colName}</th>
              <th>{s.colGroup}</th>
              <th>{s.colAmount}</th>
              <th>{s.colPaid}</th>
              <th>{s.colDue}</th>
              <th>{s.colStatus}</th>
            </tr>
          </thead>
          <tbody>
            {ledger.rows.map((r) => (
              <LedgerRowLive key={r.participationId} orgId={orgId} tripId={tripId} row={r} />
            ))}
          </tbody>
        </table>
      )}
      <p className="muted small">{s.ledgerRule}</p>
    </>
  );
}

export function BillingPage() {
  const orgs = useQuery(orgsQuery);
  const org = orgs.data ? pickActiveOrg(orgs.data) : null;
  const trips = useQuery({ ...tripsQuery(org?.id ?? ''), enabled: Boolean(org) });
  const trip = useActiveTrip(org?.id ?? '', trips.data);
  const ledgerQuery = useQuery({
    ...feesQuery(org?.id ?? '', trip?.id ?? ''),
    enabled: Boolean(org && trip),
  });
  const live = Boolean(org && trip);
  const planCard = (
    <div className="stack">
      <Card
        title={s.plan}
        id="bill-plan"
        action={<span className="chip chip--sample">{strings.dashboard.simulated}</span>}
      >
        <dl className="kv">
          <dt>{s.planName}</dt>
          <dd>{plan.name}</dd>
          <dt>{s.seats}</dt>
          <dd>{plan.seats}</dd>
          <dt>{s.price}</dt>
          <dd>{formatKrw(plan.priceKrw)}</dd>
          <dt>{s.renews}</dt>
          <dd>{plan.renewsOn}</dd>
        </dl>
        <div className="form__actions">
          <button type="button" className="btn btn--primary btn--sm" disabled>
            <Icons.card /> {s.managePortal}
          </button>
        </div>
        <p className="muted small">{s.stripeRule}</p>
      </Card>
      <Card title={s.invoices} id="bill-invoices">
        <ul className="list list--plain">
          <li>
            <strong>2026-11-02</strong> <span className="muted">{s.invoiceSample}</span>
          </li>
        </ul>
      </Card>
      {org && trip ? <ImportForm orgId={org.id} tripId={trip.id} /> : null}
    </div>
  );
  if (org && trip) {
    return (
      <SectionPage
        title={strings.nav.billing}
        subtitle={s.subtitle}
        sample={false}
        actions={<span className="chip chip--active">{strings.dashboard.live}</span>}
      >
        <div className="grid">
          <Card title={s.ledger} id="bill-ledger">
            {ledgerQuery.isPending ? (
              <p className="state__body" role="status">
                {s.loading}
              </p>
            ) : ledgerQuery.isError ? (
              <p className="field__error" role="alert">
                {errorText(ledgerQuery.error, s.loadFailed)}
              </p>
            ) : (
              <LiveLedger orgId={org.id} tripId={trip.id} ledger={ledgerQuery.data} />
            )}
          </Card>
          {planCard}
        </div>
      </SectionPage>
    );
  }
  return (
    <SectionPage title={strings.nav.billing} subtitle={s.subtitle} sample={!live}>
      <div className="grid">
        <Card
          title={s.ledger}
          id="bill-ledger"
          action={
            <button type="button" className="btn btn--ghost btn--sm">
              {s.importBank}
            </button>
          }
        >
          <div className="ledger__summary">
            <Meter
              value={ledgerTotals.collectedKrw}
              max={ledgerTotals.expectedKrw}
              tone="ok"
              label={s.collected(
                formatKrw(ledgerTotals.collectedKrw),
                formatKrw(ledgerTotals.expectedKrw),
              )}
            />
            <span className="small" data-testid="ledger-collected">
              {s.collected(
                formatKrw(ledgerTotals.collectedKrw),
                formatKrw(ledgerTotals.expectedKrw),
              )}
            </span>
            <span className="muted small">
              {s.counts(
                ledgerTotals.paid,
                ledgerTotals.partial,
                ledgerTotals.unpaid,
                ledgerTotals.refunded,
              )}
            </span>
          </div>
          <table className="table" data-testid="ledger-table">
            <thead>
              <tr>
                <th>{s.colName}</th>
                <th>{s.colGroup}</th>
                <th>{s.colAmount}</th>
                <th>{s.colPaid}</th>
                <th>{s.colStatus}</th>
              </tr>
            </thead>
            <tbody>
              {ledger.map((r) => (
                <tr key={r.id}>
                  <td>{r.name}</td>
                  <td>{r.group}</td>
                  <td>{formatKrw(r.amountKrw)}</td>
                  <td>{formatKrw(r.paidKrw)}</td>
                  <td>
                    <span className={`chip chip--fee-${r.status}`}>{s.status[r.status]}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted small">{s.ledgerRule}</p>
        </Card>
        {planCard}
      </div>
    </SectionPage>
  );
}
