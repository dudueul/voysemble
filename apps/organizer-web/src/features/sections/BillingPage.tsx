// Copyright 2026- At Day. All rights reserved.
// Billing (D23): the organizer's Voysemble plan (Stripe, web only) and the traveler fee ledger
// that the organizer records; nothing here collects money from guardians.

import { Icons } from '../../app/shell/icons';
import { ledger, ledgerTotals, plan } from '../../fixtures/sections';
import { strings } from '../../lib/strings';
import { Card, formatKrw, Meter, SectionPage } from './SectionPage';

const s = strings.billing;

export function BillingPage() {
  return (
    <SectionPage title={strings.nav.billing} subtitle={s.subtitle}>
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
        <div className="stack">
          <Card title={s.plan} id="bill-plan">
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
        </div>
      </div>
    </SectionPage>
  );
}
