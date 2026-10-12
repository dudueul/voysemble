// Copyright 2026- At Day. All rights reserved.
// Browser facts + captures for the live fee ledger (slice 027, D23): set a fee for every traveler,
// record a payment, import a bank CSV, totals and statuses from the API.

import { expect, type Page, test } from '@playwright/test';
import { OUT, signInWithOrg } from './helpers';

const CSV = [
  'name,group,guardian_name,guardian_contact',
  'Minji Park,Bus A,Sora Park,sora@example.com',
  'Juho Kim,Bus A,,',
  '"Lee, Hana",Bus B,Hana Mom,hm@example.com',
].join('\n');

async function call(page: Page, method: 'GET' | 'POST', url: string, body?: unknown) {
  return page.evaluate(
    async ({ method, url, body }) => {
      const r = await fetch(url, {
        method,
        headers: body === undefined ? {} : { 'content-type': 'application/json' },
        body: body === undefined ? null : JSON.stringify(body),
      });
      return { ok: r.ok, status: r.status, json: (await r.json()) as Record<string, unknown> };
    },
    { method, url, body },
  );
}

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await signInWithOrg(page);
});

test('billing: live ledger, set fee, payment, bank CSV', async ({ page }, info) => {
  const orgs = await call(page, 'GET', '/v1/orgs');
  const orgId = (orgs.json.organizations as { id: string }[])[0]?.id ?? '';
  const trip = await call(page, 'POST', `/v1/orgs/${orgId}/trips`, {
    name: 'Korea Concert Tour 2026',
    startsOn: '2026-12-26',
    endsOn: '2027-01-07',
    timezone: 'Europe/Rome',
  });
  const base = `/v1/orgs/${orgId}/trips/${trip.json.id as string}`;
  expect((await call(page, 'POST', `${base}/roster/import`, { csv: CSV })).status).toBe(201);

  await page.goto('/billing');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Billing');
  await expect(page.getByText('Live', { exact: true })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'No fee set yet' })).toBeVisible();
  await expect(page.getByText('3 travelers have no fee yet.')).toBeVisible();

  const form = page.getByRole('form', { name: 'Set the fee' });
  await form.getByLabel('Amount').fill('450000');
  await form.getByLabel('Due on').fill('2026-11-30');
  await form.getByRole('button', { name: 'Apply to travelers' }).click();
  await expect(page.getByTestId('fee-apply-status')).toHaveText('Fee set for 3 travelers.');
  const rows = page.getByTestId('ledger-table').locator('tbody tr');
  await expect(rows).toHaveCount(3);
  await expect(page.getByTestId('ledger-collected')).toHaveText('₩0 of ₩1,350,000 collected');
  await expect(page.getByText('Unpaid', { exact: true })).toHaveCount(3);

  await page.getByLabel('Paid by Minji Park').fill('450000');
  await page.getByLabel('Save payment for Minji Park').click();
  await expect(page.getByText('Saved Minji Park.')).toBeVisible();
  await expect(page.getByTestId('ledger-collected')).toHaveText('₩450,000 of ₩1,350,000 collected');
  await expect(page.locator('.chip--fee-paid')).toHaveCount(1);

  await page.getByLabel('Bank CSV', { exact: true }).fill('name,paid\nJuho Kim,200000\nNobody,1');
  await page.getByRole('button', { name: 'Import rows' }).click();
  await expect(page.getByTestId('fee-import-status')).toHaveText(
    '1 row applied · unmatched: Nobody',
  );
  await expect(page.locator('.chip--fee-partial')).toHaveCount(1);
  await expect(page.getByTestId('ledger-counts')).toHaveText(
    '1 paid · 1 partial · 1 unpaid · 0 refunded',
  );
  await page.screenshot({ path: `${OUT}/${info.project.name}/billing-live.png`, fullPage: true });
});
