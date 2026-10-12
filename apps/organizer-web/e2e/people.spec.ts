// Copyright 2026- At Day. All rights reserved.
// Browser facts + captures for the live People page (slice 023): the roster from the API with
// invite status before and after codes are issued, guardian binding, group chips, filters.

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

test('people: live roster, invite status, groups, filters', async ({ page }, info) => {
  const orgs = await call(page, 'GET', '/v1/orgs');
  const orgId = (orgs.json.organizations as { id: string }[])[0]?.id ?? '';
  const trip = await call(page, 'POST', `/v1/orgs/${orgId}/trips`, {
    name: 'Korea Concert Tour 2026',
    startsOn: '2026-12-26',
    endsOn: '2027-01-07',
    timezone: 'Europe/Rome',
  });
  expect(trip.status).toBe(201);
  const tripId = trip.json.id as string;
  const base = `/v1/orgs/${orgId}/trips/${tripId}`;
  expect((await call(page, 'POST', `${base}/roster/import`, { csv: CSV })).status).toBe(201);

  await page.goto('/people');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('People');
  await expect(page.getByText('Live', { exact: true })).toBeVisible();
  await expect(page.getByText('Sample data')).toHaveCount(0);
  await expect(page.locator('.page__subtitle')).toHaveText('3 travelers · 2 guardians · 0 leaders');
  await expect(page.getByTestId('people-joined')).toHaveText('0');
  await expect(page.getByTestId('people-groups')).toHaveText('2');
  await expect(page.getByTestId('people-not-joined')).toHaveText('5');
  const rows = page.getByTestId('people-table').locator('tbody tr');
  await expect(rows).toHaveCount(5);
  await expect(page.getByText('Code not issued')).toHaveCount(5);
  await expect(page.getByText('guardian of Minji Park')).toBeVisible();
  await expect(page.getByText('Showing 5 of 5 people.')).toBeVisible();

  // Issue codes from the API (the checklist's button does the same), reload: everyone is invited.
  expect((await call(page, 'POST', `${base}/invites`)).status).toBe(201);
  await page.reload();
  await expect(page.getByText('Invited')).toHaveCount(5);
  await page.screenshot({ path: `${OUT}/${info.project.name}/people-live.png`, fullPage: true });

  await page.getByRole('button', { name: 'Guardians' }).click();
  await expect(rows).toHaveCount(2);
  await page.getByRole('button', { name: 'Bus B' }).click();
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('Hana Mom');
  await expect(page.getByText('Showing 1 of 5 people.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Issue invites' })).toHaveAttribute('href', '/setup');
});
