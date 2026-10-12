// Copyright 2026- At Day. All rights reserved.
// Slice 063. Browser facts: with two trips the soonest upcoming one is active by default; the
// top bar's select switches the console and the choice survives a reload; the Trips panel's
// "Open" switches too; "New trip" creates one that becomes active; another page follows the
// choice. Without a connection to the organizations the first load says offline and "Retry"
// brings the live command center back. Captures command-center-trips.png and
// command-center-offline-first.png.

import { expect, type Page, test } from '@playwright/test';
import { OUT, signInWithOrg } from './helpers';

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

async function orgWithTrips(page: Page) {
  const orgs = await call(page, 'GET', '/v1/orgs');
  const orgId = (orgs.json.organizations as { id: string }[])[0]?.id ?? '';
  const winter = await call(page, 'POST', `/v1/orgs/${orgId}/trips`, {
    name: 'Korea Concert Tour 2026',
    startsOn: '2026-12-26',
    endsOn: '2027-01-07',
    timezone: 'Asia/Seoul',
  });
  expect(winter.status).toBe(201);
  const spring = await call(page, 'POST', `/v1/orgs/${orgId}/trips`, {
    name: 'Spring Choir Exchange',
    startsOn: '2027-03-20',
    endsOn: '2027-03-27',
    timezone: 'Europe/Rome',
  });
  expect(spring.status).toBe(201);
  return { orgId, winterId: winter.json.id as string, springId: spring.json.id as string };
}

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await signInWithOrg(page);
});

test('the organizer switches trips from the top bar and the Trips panel, and adds one', async ({
  page,
}, info) => {
  const { winterId, springId } = await orgWithTrips(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Welcome back, E2e', {
    timeout: 15_000,
  });
  // The soonest upcoming trip is the default.
  const switcher = page.getByTestId('trip-switcher');
  await expect(switcher).toHaveValue(winterId);
  await expect(page.getByText('Korea Concert Tour 2026 · starts', { exact: false })).toBeVisible();

  // The top bar switches; the page follows; the choice survives a reload.
  await switcher.selectOption(springId);
  await expect(page.getByText('Spring Choir Exchange · starts', { exact: false })).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('trip-switcher')).toHaveValue(springId, { timeout: 15_000 });
  await expect(page.getByText('Spring Choir Exchange · starts', { exact: false })).toBeVisible();

  // The Trips panel's "Open" on the other row.
  await page.getByRole('button', { name: 'Open Korea Concert Tour 2026' }).click();
  await expect(page.getByText('Korea Concert Tour 2026 · starts', { exact: false })).toBeVisible();
  await expect(page.getByTestId('trip-switcher')).toHaveValue(winterId);

  // "New trip" creates one that becomes the active trip; the zone starts as the active trip's.
  await page.getByRole('button', { name: 'New trip' }).click();
  const form = page.getByRole('form', { name: 'New trip' });
  await expect(form.getByLabel('Time zone')).toHaveValue('Asia/Seoul');
  await form.getByLabel('Trip name').fill('Autumn Science Camp');
  await form.getByLabel('Starts').fill('2027-10-04');
  await form.getByLabel('Ends').fill('2027-10-08');
  await form.getByRole('button', { name: 'Create trip' }).click();
  await expect(page.getByText('Autumn Science Camp · starts', { exact: false })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByTestId('trip-switcher').locator('option')).toHaveCount(3);
  await expect(page.getByRole('form', { name: 'New trip' })).toHaveCount(0);
  const campId = await page.getByTestId('trip-switcher').inputValue();
  expect(campId).not.toBe(winterId);
  expect(campId).not.toBe(springId);
  await page.mouse.move(0, 0);
  await page.screenshot({
    path: `${OUT}/${info.project.name}/command-center-trips.png`,
    fullPage: true,
  });

  // Another page follows the choice.
  await page.goto('/people');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('People');
  await expect(page.getByTestId('trip-switcher')).toHaveValue(campId);
});

test('offline on the first load says so; "Retry" brings the command center back', async ({
  page,
}, info) => {
  await orgWithTrips(page);
  await page.route('**/v1/orgs**', (route) => route.abort('internetdisconnected'));
  await page.goto('/');
  await expect(page.getByRole('status').filter({ hasText: 'You are offline' })).toBeVisible({
    timeout: 15_000,
  });
  await page.screenshot({
    path: `${OUT}/${info.project.name}/command-center-offline-first.png`,
    fullPage: true,
  });
  await page.unroute('**/v1/orgs**');
  await page.getByRole('button', { name: 'Retry' }).click();
  await expect(page.getByText('Live', { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('trip-switcher')).toBeVisible();
});
