// Copyright 2026- At Day. All rights reserved.
// Browser facts for slice 029 (D15): the organizer opens a meeting window from Safety with the
// meeting point; a traveler reports "inside" from "the phone" (through the API, as the app does
// after judging its own fix); the console shows the state on the schematic map with a "Live"
// chip; closing the window erases the point and later reports are refused.

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
  'Hana Lee,Bus B,,',
].join('\n');

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

test('meeting window: opened on the console, a traveler reports inside, closed', async ({
  page,
  browser,
}, info) => {
  await signInWithOrg(page);
  await page.getByRole('button', { name: 'Use the sample trip' }).click();
  await page.getByRole('button', { name: 'Create trip' }).click();
  await expect(page.getByTestId('step-3')).toHaveAttribute('data-state', 'open');
  await page.getByLabel('Or paste CSV').fill(CSV);
  await page.getByRole('button', { name: 'Import rows' }).click();
  await expect(page.getByTestId('count-traveler')).toHaveText('3');
  await page.getByRole('button', { name: 'Issue invite codes' }).click();
  const code = await page
    .getByTestId('invite-table')
    .locator('tbody tr', { hasText: 'Minji Park' })
    .first()
    .locator('code')
    .textContent();

  // No window yet: the form. Bus A only, 200 m around the Colosseum entrance.
  await page.goto('/safety');
  await expect(page.getByTestId('no-window')).toBeVisible();
  const form = page.getByRole('form', { name: 'Open a window' });
  await form.getByLabel('Label').fill('Colosseum regroup');
  await form.getByLabel('Place').fill('Colosseum, main entrance');
  await form.getByLabel('Radius (m)').fill('200');
  await form.getByLabel('Groups', { exact: false }).fill('Bus A');
  await form.getByLabel('Meeting point latitude').fill('41.8902');
  await form.getByLabel('Meeting point longitude').fill('12.4922');
  await form.getByRole('button', { name: 'Open window' }).click();
  await expect(page.getByText('Meeting window: Colosseum regroup')).toBeVisible();
  await expect(page.getByTestId('window-status')).toHaveText('Open');
  await expect(page.getByText('Live', { exact: true })).toBeVisible();
  await expect(page.getByTestId('win-opted_out')).toHaveText('2');
  await expect(page.getByTestId('window-members').getByRole('listitem')).toHaveCount(2);

  // Minji (traveler, Bus A) redeems in a second context and reports what her phone judged.
  const ctx = await browser.newContext();
  const minji = await ctx.newPage();
  await signIn(minji);
  const redeem = await call(minji, 'POST', '/v1/invites/redeem', { code });
  expect(redeem.ok, `redeem ${code}: ${redeem.status} ${redeem.text}`).toBeTruthy();
  const { organizationId, tripId } = JSON.parse(redeem.text) as {
    organizationId: string;
    tripId: string;
  };
  const list = await call(minji, 'GET', `/v1/orgs/${organizationId}/trips/${tripId}/windows`);
  expect(list.ok, `list: ${list.status} ${list.text}`).toBeTruthy();
  const { windows } = JSON.parse(list.text) as {
    windows: { id: string; center: unknown; members: { displayName: string }[] }[];
  };
  expect(windows).toHaveLength(1);
  // A member sees the meeting point (to judge on the device) and only her own row.
  expect(windows[0]?.center).toEqual({ lat: 41.8902, lng: 12.4922 });
  expect(windows[0]?.members.map((m) => m.displayName)).toEqual(['Minji Park']);
  const windowId = windows[0]?.id ?? '';
  const report = await call(
    minji,
    'PUT',
    `/v1/orgs/${organizationId}/trips/${tripId}/windows/${windowId}/me`,
    { state: 'inside' },
  );
  expect(report.ok, `report: ${report.status} ${report.text}`).toBeTruthy();
  expect(JSON.parse(report.text)).toMatchObject({ state: 'inside', windowStatus: 'open' });

  await page.reload();
  await expect(page.getByTestId('win-inside')).toHaveText('1');
  await expect(page.getByTestId('win-opted_out')).toHaveText('1');
  const minjiRow = page
    .getByTestId('window-members')
    .getByRole('listitem')
    .filter({ hasText: 'Minji Park' });
  await expect(minjiRow).toContainText('Minji Park');
  await expect(minjiRow).toContainText('Inside');
  await page.mouse.move(0, 0);
  await page.screenshot({
    path: `${OUT}/${info.project.name}/safety-window-live.png`,
    fullPage: true,
  });

  // Close: the point is erased and the phone's next report is refused.
  await page.getByRole('button', { name: 'Close window' }).click();
  await expect(page.getByTestId('no-window')).toBeVisible();
  await expect(page.getByTestId('earlier-windows')).toContainText('Colosseum regroup');
  await expect(page.getByTestId('earlier-windows')).toContainText('Closed');
  const after = await call(minji, 'GET', `/v1/orgs/${organizationId}/trips/${tripId}/windows`);
  expect(
    (JSON.parse(after.text) as { windows: { center: unknown }[] }).windows[0]?.center,
  ).toBeNull();
  const late = await call(
    minji,
    'PUT',
    `/v1/orgs/${organizationId}/trips/${tripId}/windows/${windowId}/me`,
    { state: 'inside' },
  );
  expect(late.status).toBe(409);
  await ctx.close();
});
