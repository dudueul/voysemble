// Copyright 2026- At Day. All rights reserved.
// Browser facts for slice 034: after a leader closes a head count with a missing traveler and the
// organizer publishes an announcement, Safety names the missing traveler from the latest closed
// count (D25) and Reports shows the live numbers, charts and the CSV export.

import { expect, type Page, test } from '@playwright/test';
import { OUT, signIn, signInWithOrg } from './helpers';

async function call(page: Page, method: 'GET' | 'POST' | 'PUT', url: string, body?: unknown) {
  return page.evaluate(
    async ({ method, url, body }) => {
      const r = await fetch(url, {
        method,
        headers: body === undefined ? {} : { 'content-type': 'application/json' },
        body: body === undefined ? null : JSON.stringify(body),
      });
      return { ok: r.ok, status: r.status, text: await r.text() };
    },
    { method, url, body },
  );
}

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

test('safety missing list and the live report', async ({ page, browser }, info) => {
  await signInWithOrg(page);
  await page.getByRole('button', { name: 'Use the sample trip' }).click();
  await page.getByRole('button', { name: 'Create trip' }).click();
  await expect(page.getByTestId('step-3')).toHaveAttribute('data-state', 'open');
  await page
    .getByLabel('Or paste CSV')
    .fill('name,group,guardian_name,guardian_contact\nMinji Park,Bus A,,\nJuho Kim,Bus A,,');
  await page.getByRole('button', { name: 'Import rows' }).click();
  await expect(page.getByTestId('count-traveler')).toHaveText('2');
  await page.getByLabel('Leader name').fill('Kim');
  await page.getByLabel('Group', { exact: true }).fill('Bus A');
  await page.getByRole('button', { name: 'Add leader' }).click();
  await page.getByRole('button', { name: 'Issue invite codes' }).click();
  const code = await page
    .getByTestId('invite-table')
    .locator('tbody tr', { hasText: 'Kim' })
    .first()
    .locator('code')
    .textContent();

  // Before any fact: the report is honest.
  await page.goto('/reports');
  await expect(page.getByText('Live', { exact: true })).toBeVisible();
  await expect(page.getByTestId('report-empty')).toBeVisible();
  await expect(page.getByTestId('kpi-Last head count closed in')).toHaveText('—');

  // Kim closes a head count from "the phone" with Juho missing.
  const ctx = await browser.newContext();
  const kim = await ctx.newPage();
  await signIn(kim);
  const redeem = await call(kim, 'POST', '/v1/invites/redeem', { code });
  expect(redeem.ok, `redeem: ${redeem.status} ${redeem.text}`).toBeTruthy();
  const { organizationId, tripId } = JSON.parse(redeem.text) as {
    organizationId: string;
    tripId: string;
  };
  const roster = JSON.parse(
    (await call(kim, 'GET', `/v1/orgs/${organizationId}/trips/${tripId}/roster`)).text,
  ) as {
    participations: { id: string; displayName: string }[];
  };
  const minji = roster.participations.find((p) => p.displayName === 'Minji Park')?.id;
  const sync = await call(
    kim,
    'PUT',
    `/v1/orgs/${organizationId}/trips/${tripId}/headcounts/${crypto.randomUUID()}`,
    {
      openedAtDevice: '06:50',
      closedAtDevice: '06:58',
      groupName: 'Bus A',
      marks: [{ participationId: minji, mark: 'present' }],
    },
  );
  expect(sync.ok, `sync: ${sync.status} ${sync.text}`).toBeTruthy();
  await ctx.close();

  // The organizer publishes an announcement that takes acks.
  await page.goto('/communication');
  await page.getByLabel('Title').fill('Bus leaves 07:15');
  await page.getByLabel('Message').fill('Lobby at 07:10.');
  await page.getByRole('button', { name: 'Publish' }).click();
  await expect(page.getByTestId('announcement-list').getByRole('listitem').first()).toContainText(
    'Bus leaves 07:15',
  );

  // Safety: the missing list from the latest closed head count.
  await page.goto('/safety');
  const missing = page.getByTestId('missing-list');
  await expect(missing.getByRole('listitem')).toHaveCount(1);
  await expect(missing).toContainText('Juho Kim');
  await expect(missing).toContainText('Bus A · closed 06:58 by Kim · 1 missing');
  await page.mouse.move(0, 0);
  await page.screenshot({
    path: `${OUT}/${info.project.name}/safety-missing-live.png`,
    fullPage: true,
  });

  // Reports: live tiles, the day chart, the CSV.
  await page.goto('/reports');
  await expect(page.getByTestId('kpi-Last head count closed in')).toHaveText('8 min');
  await expect(page.getByTestId('kpi-Open incidents')).toHaveText('1');
  await expect(page.getByTestId('kpi-Average ack rate')).toHaveText('0%');
  await expect(page.getByTestId('kpi-Fees collected')).toHaveText('—');
  // A zero-height bar is not "visible" to Playwright; it is in the chart and in the table view.
  // The sample trip starts in December, so today's index is negative (D-74) until departure.
  await expect(page.getByRole('button', { name: /^D-?\d+: 0%$/ })).toBeAttached();
  // The table view is a collapsed <details>; open the first one (the ack chart) to read its row.
  await page.getByText('Table view').first().click();
  await expect(page.getByRole('row', { name: /D-?\d+ 0%/ })).toBeVisible();
  await page.getByText('Table view').first().click();
  await page.mouse.move(0, 0);
  await page.screenshot({ path: `${OUT}/${info.project.name}/reports-live.png`, fullPage: true });
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export CSV' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('voysemble-report.csv');
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const csv = Buffer.concat(chunks).toString('utf8');
  expect(csv.split('\n')[0]).toBe(
    'day,date,announcements_sent,ack_rate_pct,headcounts,avg_close_minutes,missing',
  );
  // One row: today, a negative index before departure.
  expect(csv).toMatch(/\n-?\d+,\d{4}-\d{2}-\d{2},1,0,1,8,1\n$/);
});
