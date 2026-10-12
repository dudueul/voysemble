// Copyright 2026- At Day. All rights reserved.
// Browser facts for slice 031 (D28): a traveler who joined from "the phone" is signed out from
// the person card; her phone's next call is 401 with the wipe directive; the row reads Invited
// with a new code the same account redeems again; the fact is on the timeline.

import { expect, type Page, test } from '@playwright/test';
import { OUT, signIn, signInWithOrg } from './helpers';

async function call(page: Page, method: 'GET' | 'POST', url: string, body?: unknown) {
  return page.evaluate(
    async ({ method, url, body }) => {
      const r = await fetch(url, {
        method,
        headers: body === undefined ? {} : { 'content-type': 'application/json' },
        body: body === undefined ? null : JSON.stringify(body),
      });
      return {
        ok: r.ok,
        status: r.status,
        wipe: r.headers.get('x-voysemble-wipe'),
        text: await r.text(),
      };
    },
    { method, url, body },
  );
}

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

test('revoke devices: the phone is wiped, the row re-issues a code, the person re-enrols', async ({
  page,
  browser,
}, info) => {
  await signInWithOrg(page);
  await page.getByRole('button', { name: 'Use the sample trip' }).click();
  await page.getByRole('button', { name: 'Create trip' }).click();
  await expect(page.getByTestId('step-3')).toHaveAttribute('data-state', 'open');
  await page
    .getByLabel('Or paste CSV')
    .fill('name,group,guardian_name,guardian_contact\nMinji Park,Bus A,,\nJuho Kim,Bus A,,');
  await page.getByRole('button', { name: 'Import rows' }).click();
  await expect(page.getByTestId('count-traveler')).toHaveText('2');
  await page.getByRole('button', { name: 'Issue invite codes' }).click();
  const code = await page
    .getByTestId('invite-table')
    .locator('tbody tr', { hasText: 'Minji Park' })
    .first()
    .locator('code')
    .textContent();

  // Minji joins from "the phone".
  const ctx = await browser.newContext();
  const minji = await ctx.newPage();
  await signIn(minji);
  const redeem = await call(minji, 'POST', '/v1/invites/redeem', { code });
  expect(redeem.ok, `redeem: ${redeem.status} ${redeem.text}`).toBeTruthy();
  expect((await call(minji, 'GET', '/v1/me')).status).toBe(200);

  // The organizer revokes her devices from the card.
  await page.goto('/people');
  // The fixture table shows until the organization and trip queries land; wait for the live chip.
  await expect(page.getByText('Live', { exact: true })).toBeVisible();
  const rows = page.getByTestId('people-table').locator('tbody tr');
  await expect(rows).toHaveCount(2);
  await expect(rows.filter({ hasText: 'Minji Park' })).toContainText('Joined');
  await page.getByRole('button', { name: 'Open the card of Minji Park' }).click();
  const card = page.getByTestId('person-card');
  await expect(card.getByRole('button', { name: 'Remove from roster' })).toHaveCount(0);
  await card.getByRole('button', { name: 'Revoke devices' }).click();
  await expect(card.getByTestId('revoke-devices-confirm')).toContainText(
    'Sign out every phone of Minji Park',
  );
  await card.getByRole('button', { name: 'Yes, revoke devices' }).click();
  const status = page.getByTestId('roster-action-status');
  await expect(status).toContainText('1 phone signed out. New code');
  await expect(rows.filter({ hasText: 'Minji Park' })).toContainText('Invited');
  await expect(card.getByTestId('timeline')).toContainText('Devices revoked by Owner');
  await page.mouse.move(0, 0);
  await page.screenshot({ path: `${OUT}/${info.project.name}/people-revoke.png`, fullPage: true });
  const newCode = /New code ([A-Z0-9-]+)/.exec((await status.textContent()) ?? '')?.[1] ?? '';
  expect(newCode).not.toBe(code);

  // Her phone's next call carries the wipe directive; the same account re-enrols with the new code.
  const wiped = await call(minji, 'GET', '/v1/me');
  expect(wiped.status).toBe(401);
  expect(wiped.wipe).toBe('1');
  expect(wiped.text).toContain('SESSION_WIPED');
  await signIn(minji);
  expect((await call(minji, 'POST', '/v1/invites/redeem', { code })).status).toBe(409);
  const again = await call(minji, 'POST', '/v1/invites/redeem', { code: newCode });
  expect(again.ok, `re-enrol: ${again.status} ${again.text}`).toBeTruthy();
  expect(
    (JSON.parse(again.text) as { participation: { groupName: string } }).participation.groupName,
  ).toBe('Bus A');
  await ctx.close();
  await page.reload();
  await expect(page.getByText('Live', { exact: true })).toBeVisible();
  await expect(rows).toHaveCount(2);
  await expect(rows.filter({ hasText: 'Minji Park' })).toContainText('Joined');
});
