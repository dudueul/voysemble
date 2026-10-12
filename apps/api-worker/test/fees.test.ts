// Copyright 2026- At Day. All rights reserved.
// Facts (D23): the ledger starts empty with every traveler "without fee"; applying a fee creates a
// row per traveler and keeps paid amounts on a second apply; a row update derives paid / partial /
// refunded; a bank CSV import sets paid totals by roster name (case and spacing ignored),
// reports unmatched names and bad rows, and is idempotent; a guardian sees their traveler's
// balance; travelers, guardians and leaders cannot touch the ledger; the status rule. Slice 066:
// the CSV export lists every traveler in roster order with major-unit amounts and a balance,
// those without a fee as no_fee, quoted where a name needs it, with a byte-order mark and an
// attachment name; only staff may fetch it.

import {
  type FeeImportResponse,
  type FeeLedger,
  type FeeRow,
  feeStatusOf,
  type GuardianStatus,
  type IssueInvitesResponse,
  type RosterImportResponse,
} from '@voysemble/contracts';
import { describe, expect, it } from 'vitest';
import { fileSlug } from '../src/lib/csv';
import { feeLedgerCsv, toMinor } from '../src/routes/fees';
import { api, createOrg, createTrip, json, SAMPLE_CSV, signIn } from './helpers';

async function setupTrip() {
  const nate = await signIn('nate@example.com');
  const org = await createOrg(nate);
  const trip = await createTrip(nate, org.id);
  const imported = await json<RosterImportResponse>(
    await api(nate).post(`/v1/orgs/${org.id}/trips/${trip.id}/roster/import`, { csv: SAMPLE_CSV }),
  );
  const issued = await json<IssueInvitesResponse>(
    await api(nate).post(`/v1/orgs/${org.id}/trips/${trip.id}/invites`),
  );
  const codeFor = (name: string) => issued.invites.find((i) => i.displayName === name)?.code ?? '';
  const sora = await signIn('sora@example.com');
  expect((await api(sora).post('/v1/invites/redeem', { code: codeFor('Sora Park') })).status).toBe(
    200,
  );
  const minji = await signIn('minji@example.com');
  expect(
    (await api(minji).post('/v1/invites/redeem', { code: codeFor('Minji Park') })).status,
  ).toBe(200);
  const byName = (name: string) =>
    imported.participations.find((p) => p.displayName === name)?.id ?? '';
  return { nate, sora, minji, base: `/v1/orgs/${org.id}/trips/${trip.id}`, byName };
}

describe('fee ledger (slice 027)', () => {
  it('apply, update, import, totals, guardian balance, and who may touch it', async () => {
    const { nate, sora, minji, base, byName } = await setupTrip();
    const empty = await json<FeeLedger>(await api(nate).get(`${base}/fees`));
    expect(empty).toMatchObject({ currency: 'KRW', rows: [], withoutFee: 3 });
    expect(empty.totals).toEqual({
      expectedMinor: 0,
      collectedMinor: 0,
      refundedMinor: 0,
      paid: 0,
      partial: 0,
      unpaid: 0,
      refunded: 0,
    });
    // The guardian sees no fee yet.
    expect(
      (await json<GuardianStatus>(await api(sora).get(`${base}/guardian/status`))).fee,
    ).toBeNull();

    const applied = await json<FeeLedger>(
      await api(nate).post(`${base}/fees/apply`, {
        amountDueMinor: 450_000,
        currency: 'KRW',
        dueOn: '2026-11-30',
      }),
    );
    expect(applied.rows).toHaveLength(3);
    expect(applied.withoutFee).toBe(0);
    expect(
      applied.rows.every(
        (r) => r.status === 'unpaid' && r.amountDueMinor === 450_000 && r.dueOn === '2026-11-30',
      ),
    ).toBe(true);
    expect(applied.totals).toMatchObject({
      expectedMinor: 1_350_000,
      collectedMinor: 0,
      unpaid: 3,
    });

    const minjiId = byName('Minji Park');
    const row = await json<FeeRow>(
      await api(nate).patch(`${base}/fees/${minjiId}`, { paidMinor: 450_000 }),
    );
    expect(row).toMatchObject({
      displayName: 'Minji Park',
      paidMinor: 450_000,
      status: 'paid',
      updatedByName: 'Owner',
    });
    expect(
      (await api(nate).patch(`${base}/fees/${crypto.randomUUID()}`, { paidMinor: 1 })).status,
    ).toBe(404);
    // A guardian row is not a traveler row.
    expect(
      (await api(nate).patch(`${base}/fees/${byName('Sora Park')}`, { paidMinor: 1 })).status,
    ).toBe(404);

    // A second apply keeps the paid amount and only fills rows without a fee (none left).
    const again = await json<FeeLedger>(
      await api(nate).post(`${base}/fees/apply`, { amountDueMinor: 500_000 }),
    );
    expect(again.rows.find((r) => r.participationId === minjiId)).toMatchObject({
      amountDueMinor: 450_000,
      paidMinor: 450_000,
      status: 'paid',
    });
    // Overwriting changes the amount but not the payment: Minji becomes partial.
    const overwritten = await json<FeeLedger>(
      await api(nate).post(`${base}/fees/apply`, {
        amountDueMinor: 500_000,
        dueOn: '2026-11-30',
        onlyWithoutFee: false,
      }),
    );
    expect(overwritten.rows.find((r) => r.participationId === minjiId)).toMatchObject({
      amountDueMinor: 500_000,
      paidMinor: 450_000,
      status: 'partial',
    });

    // Bank CSV: totals paid so far, names matched loosely, unmatched reported, bad rows skipped, idempotent.
    const csv =
      'name,paid,note\n JUHO  kim ,500000,transfer 11/02\nMinji Park,500000,\nNobody,1,\nLee\\, Hana,abc,\n';
    const imported = await json<FeeImportResponse>(
      await api(nate).post(`${base}/fees/import`, { csv }),
    );
    expect(imported.applied).toBe(2);
    expect(imported.unmatched).toEqual(['Nobody']);
    expect(imported.skipped).toEqual([{ line: 5, reason: 'paid is not a number' }]);
    expect(imported.ledger.rows.find((r) => r.displayName === 'Juho Kim')).toMatchObject({
      paidMinor: 500_000,
      status: 'paid',
      note: 'transfer 11/02',
    });
    expect(imported.ledger.totals).toMatchObject({
      expectedMinor: 1_500_000,
      collectedMinor: 1_000_000,
      paid: 2,
      unpaid: 1,
    });
    const twice = await json<FeeImportResponse>(
      await api(nate).post(`${base}/fees/import`, { csv }),
    );
    expect(twice.ledger.totals.collectedMinor).toBe(1_000_000);
    expect((await api(nate).post(`${base}/fees/import`, { csv: 'who,much\nx,1' })).status).toBe(
      400,
    );

    // A refund.
    const refunded = await json<FeeRow>(
      await api(nate).patch(`${base}/fees/${minjiId}`, { refundedMinor: 500_000 }),
    );
    expect(refunded.status).toBe('refunded');
    const fee = (await json<GuardianStatus>(await api(sora).get(`${base}/guardian/status`))).fee;
    expect(fee).toEqual({
      currency: 'KRW',
      amountDueMinor: 500_000,
      paidMinor: 500_000,
      refundedMinor: 500_000,
      balanceMinor: 500_000,
      dueOn: '2026-11-30',
      status: 'refunded',
    });

    // Nobody but staff touches the ledger.
    expect((await api(minji).get(`${base}/fees`)).status).toBe(403);
    expect((await api(sora).get(`${base}/fees`)).status).toBe(403);
    expect((await api(sora).post(`${base}/fees/apply`, { amountDueMinor: 1 })).status).toBe(403);
    expect((await api(minji).patch(`${base}/fees/${minjiId}`, { paidMinor: 0 })).status).toBe(403);
  });

  it('exports the ledger as a CSV, every traveler in roster order (slice 066)', async () => {
    const { nate, sora, minji, base, byName } = await setupTrip();
    expect(
      (
        await api(nate).patch(`${base}/fees/${byName('Minji Park')}`, {
          amountDueMinor: 450000,
          paidMinor: 450000,
          dueOn: '2026-11-30',
          note: 'bank 10/12',
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await api(nate).patch(`${base}/fees/${byName('Juho Kim')}`, {
          amountDueMinor: 450000,
          paidMinor: 200000,
        })
      ).status,
    ).toBe(200);
    const res = await api(nate).get(`${base}/fees/export.csv`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/csv; charset=utf-8');
    expect(res.headers.get('content-disposition')).toMatch(
      /^attachment; filename="fees-korea-concert-tour-\d{4}-\d{2}-\d{2}\.csv"$/,
    );
    expect(res.headers.get('cache-control')).toBe('no-store');
    // `Response.text()` strips a byte-order mark, so the bytes say whether it was sent.
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const lines = new TextDecoder().decode(bytes).split('\r\n');
    expect(lines[0]).toBe(
      'name,group,currency,amount_due,paid,refunded,balance,status,due_on,note',
    );
    const roster = await json<{ participations: { displayName: string; role: string }[] }>(
      await api(nate).get(`${base}/roster`),
    );
    const travelers = roster.participations.filter((p) => p.role === 'traveler');
    const byLine: Record<string, string> = {
      'Minji Park': 'Minji Park,Bus A,KRW,450000,450000,0,0,paid,2026-11-30,bank 10/12',
      'Juho Kim': 'Juho Kim,Bus A,KRW,450000,200000,0,250000,partial,,',
      'Lee, Hana': '"Lee, Hana",Bus B,KRW,,,,,no_fee,,',
    };
    expect(lines.slice(1, 4)).toEqual(travelers.map((p) => byLine[p.displayName]));
    expect(lines[4]).toBe('');
    expect((await api(sora).get(`${base}/fees/export.csv`)).status).toBe(403);
    expect((await api(minji).get(`${base}/fees/export.csv`)).status).toBe(403);
    // The pure pieces: dollars with cents, a quoted note, the slug.
    const usd = feeLedgerCsv(
      {
        currency: 'USD',
        withoutFee: 0,
        totals: {
          expectedMinor: 0,
          collectedMinor: 0,
          refundedMinor: 0,
          paid: 0,
          partial: 0,
          unpaid: 0,
          refunded: 0,
        },
        rows: [
          {
            participationId: 'p1',
            displayName: 'Ana',
            groupName: null,
            currency: 'USD',
            amountDueMinor: 12050,
            paidMinor: 5000,
            refundedMinor: 0,
            dueOn: null,
            note: 'said "later"',
            status: 'partial',
            updatedAt: '2026-10-12T00:00:00.000Z',
            updatedByName: 'Owner',
          },
        ],
      },
      [
        { id: 'p1', role: 'traveler', displayName: 'Ana', groupName: null } as never,
        { id: 'g1', role: 'guardian', displayName: 'Guardian', groupName: null } as never,
      ],
    );
    expect(usd.slice(1).split('\r\n')[1]).toBe(
      'Ana,,USD,120.50,50.00,0.00,70.50,partial,,"said ""later"""',
    );
    expect(fileSlug('Korea Concert Tour 2026')).toBe('korea-concert-tour-2026');
    expect(fileSlug('서울 투어')).toBe('trip');
  });

  it('feeStatusOf and toMinor are the one rule', () => {
    expect(feeStatusOf(450_000, 0, 0)).toBe('unpaid');
    expect(feeStatusOf(450_000, 100_000, 0)).toBe('partial');
    expect(feeStatusOf(450_000, 450_000, 0)).toBe('paid');
    expect(feeStatusOf(450_000, 450_000, 450_000)).toBe('refunded');
    expect(feeStatusOf(450_000, 450_000, 100_000)).toBe('partial');
    expect(feeStatusOf(0, 0, 0)).toBe('paid');
    expect(toMinor('450000', 0)).toBe(450_000);
    expect(toMinor('450,000', 0)).toBe(450_000);
    expect(toMinor('₩450000', 0)).toBe(450_000);
    expect(toMinor('120.50', 2)).toBe(12_050);
    expect(toMinor('abc', 0)).toBeNull();
    expect(toMinor('-5', 0)).toBeNull();
  });
});
