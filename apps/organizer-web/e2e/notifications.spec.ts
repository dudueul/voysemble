// Copyright 2026- At Day. All rights reserved.
// Browser facts for slice 052 (D29): with a roster of travelers and guardians, a required-ack
// announcement shared with guardians goes out in the priority lane to the travelers and the
// normal lane to the guardians; the bell leads to the log, which counts the lanes. Capture
// notifications-log.png.

import { expect, type Page, test } from '@playwright/test';
import { OUT, signInWithOrg } from './helpers';

const CSV =
  'name,group,guardian_name,guardian_contact\nMinji Park,Bus A,Sora Park,sora@example.com\nJuho Kim,Bus A,,\nLee Hana,Bus B,Hana Mom,hm@example.com';

async function call(page: Page, method: 'GET' | 'POST' | 'PATCH', url: string, body?: unknown) {
  return page.evaluate(
    async ({ method, url, body }) => {
      const r = await fetch(url, {
        method,
        headers: body === undefined ? {} : { 'content-type': 'application/json' },
        body: body === undefined ? null : JSON.stringify(body),
      });
      return { status: r.status, json: (await r.json()) as Record<string, unknown> };
    },
    { method, url, body },
  );
}

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

test('the notification log counts the lanes of an announcement', async ({ page }, info) => {
  await signInWithOrg(page);
  const orgs = await call(page, 'GET', '/v1/orgs');
  const orgId = (orgs.json.organizations as { id: string }[])[0]?.id ?? '';
  // No quiet hours for this run, whatever the wall-clock in Rome.
  expect(
    (
      await call(page, 'PATCH', `/v1/orgs/${orgId}`, {
        settings: { quietHours: { from: '09:00', to: '09:00' } },
      })
    ).status,
  ).toBe(200);
  const trip = await call(page, 'POST', `/v1/orgs/${orgId}/trips`, {
    name: 'Korea Concert Tour 2026',
    startsOn: '2026-12-26',
    endsOn: '2027-01-07',
    timezone: 'Europe/Rome',
  });
  const base = `/v1/orgs/${orgId}/trips/${trip.json.id as string}`;
  expect((await call(page, 'POST', `${base}/roster/import`, { csv: CSV })).status).toBe(201);
  expect(
    (
      await call(page, 'POST', `${base}/announcements`, {
        title: 'Breakfast moved to 06:30',
        body: 'Lobby. Bus leaves 07:15.',
        requiresAck: true,
        sharedWithGuardians: true,
      })
    ).status,
  ).toBe(201);
  expect(
    (
      await call(page, 'POST', `${base}/announcements`, {
        title: 'Photos from the rehearsal',
        body: 'In the Memories tab.',
        requiresAck: false,
        sharedWithGuardians: false,
      })
    ).status,
  ).toBe(201);

  await page.goto('/');
  await page.getByRole('link', { name: 'Notifications' }).click();
  await expect(page).toHaveURL(/\/notifications$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Notifications');
  await expect(page.getByText('Live', { exact: true })).toBeVisible();
  await expect(page.locator('.page__subtitle')).toHaveText('2 events sent');
  const rows = page.getByTestId('notif-log').locator('tbody tr');
  await expect(rows).toHaveCount(2);
  const shared = rows.filter({ hasText: 'Breakfast moved to 06:30' });
  await expect(shared.locator('td').nth(2)).toHaveText('3');
  await expect(shared.locator('td').nth(3)).toHaveText('2');
  await expect(shared.locator('td').nth(4)).toHaveText('0');
  const plain = rows.filter({ hasText: 'Photos from the rehearsal' });
  await expect(plain.locator('td').nth(2)).toHaveText('0');
  await expect(plain.locator('td').nth(3)).toHaveText('3');
  await page.mouse.move(0, 0);
  await page.screenshot({
    path: `${OUT}/${info.project.name}/notifications-log.png`,
    fullPage: true,
  });
});
