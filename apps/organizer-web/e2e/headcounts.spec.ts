// Copyright 2026- At Day. All rights reserved.
// Browser facts for slices 013 and 014: a leader's closed head count with a missing traveler
// (sent through the API, as the phone would) opens an incident card that the organizer sees on
// Safety and resolves with a note; the command center shows the same facts live (head count per
// group, the incident as a red alert, traveler count) with a "Live" chip instead of "Sample data".

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

const CSV = [
  'name,group,guardian_name,guardian_contact',
  'Minji Park,Bus A,,',
  'Juho Kim,Bus A,,',
].join('\n');

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

test('head count closed with a missing traveler opens an incident the organizer resolves', async ({
  page,
  browser,
}, info) => {
  await signInWithOrg(page);
  await page.getByRole('button', { name: 'Use the sample trip' }).click();
  await page.getByRole('button', { name: 'Create trip' }).click();
  await expect(page.getByTestId('step-3')).toHaveAttribute('data-state', 'open');
  await page.getByLabel('Or paste CSV').fill(CSV);
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

  await page.goto('/safety');
  await expect(page.getByRole('status')).toContainText('No incidents');

  // Kim (leader) redeems in a second context and syncs a closed head count from "the phone".
  const ctx = await browser.newContext();
  const kim = await ctx.newPage();
  await signIn(kim);
  const redeem = await call(kim, 'POST', '/v1/invites/redeem', { code });
  expect(redeem.ok, `redeem ${code}: ${redeem.status} ${redeem.text}`).toBeTruthy();
  const { organizationId, tripId } = JSON.parse(redeem.text) as {
    organizationId: string;
    tripId: string;
  };
  const roster = await call(kim, 'GET', `/v1/orgs/${organizationId}/trips/${tripId}/roster`);
  const { participations } = JSON.parse(roster.text) as {
    participations: { id: string; displayName: string }[];
  };
  const minji = participations.find((p) => p.displayName === 'Minji Park')?.id;
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
  const { incidentId } = JSON.parse(sync.text) as { incidentId: string | null };
  expect(incidentId).not.toBeNull();
  await ctx.close();

  // Slice 014: the command center is live for this trip.
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Welcome back, E2e');
  await expect(page.getByText('Live', { exact: true })).toBeVisible();
  await expect(page.getByText('starts in', { exact: false })).toBeVisible();
  await expect(page.getByTestId('stat-Travelers')).toHaveText('2');
  await expect(page.getByTestId('stat-Open alerts')).toHaveText('1');
  await expect(page.getByTestId('hc-Bus A')).toContainText('1/2');
  await expect(page.getByTestId('hc-Bus A')).toContainText('1 missing');
  await expect(page.getByRole('article').first()).toContainText(
    'Head count closed with 1 missing (Bus A, 06:58)',
  );
  await expect(page.getByRole('article').first()).toContainText('Juho Kim');
  await page.mouse.move(0, 0);
  await page.screenshot({
    path: `${OUT}/${info.project.name}/command-center-live.png`,
    fullPage: true,
  });

  await page.goto('/safety');
  const card = page.getByTestId(`incident-${incidentId}`);
  await expect(card).toContainText('Head count closed with 1 missing (Bus A, 06:58)');
  await expect(card).toContainText('Juho Kim');
  await expect(card).toContainText('Open');
  await expect(page.getByRole('heading', { level: 1 }).locator('..')).toContainText(
    '1 open incident',
  );
  await page.mouse.move(0, 0);
  await page.screenshot({ path: `${OUT}/${info.project.name}/safety-live.png`, fullPage: true });

  await card.getByLabel('What happened (optional)').fill('Juho was in the lobby.');
  await card.getByRole('button', { name: 'Resolve' }).click();
  await expect(card).toContainText('Resolved by Organizer');
  await expect(card).toContainText('Juho was in the lobby.');
  await expect(page.getByRole('heading', { level: 1 }).locator('..')).toContainText(
    'No open incidents',
  );
});
