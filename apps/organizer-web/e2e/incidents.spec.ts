// Copyright 2026- At Day. All rights reserved.
// Slice 068 (D17). Browser facts: the organizer opens an incident by hand from the Safety page,
// naming a traveler; the card leads the list as open, opened by the owner; the traveler's
// guardian, joined from "the phone", reads the projected card. Captures safety-manual-incident.png.

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
      return { ok: r.ok, status: r.status, text: await r.text() };
    },
    { method, url, body },
  );
}

const CSV = [
  'name,group,guardian_name,guardian_contact',
  'Minji Park,Bus A,Sora Park,sora@example.com',
  'Juho Kim,Bus A,,',
].join('\n');

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

test('the organizer opens an incident by hand; the guardian reads the projected card', async ({
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
  await page.getByRole('button', { name: 'Issue invite codes' }).click();
  const soraCode = await page
    .getByTestId('invite-table')
    .locator('tbody tr', { hasText: 'Sora Park' })
    .first()
    .locator('code')
    .textContent();

  await page.goto('/safety');
  await expect(page.getByRole('status').filter({ hasText: 'No incidents' })).toBeVisible();
  await page.getByRole('button', { name: 'New incident' }).click();
  const form = page.getByRole('form', { name: 'New incident' });
  await form.getByLabel('What happened').fill('Lost passport at the hotel desk');
  await form.getByLabel('Minji Park').check();
  await form.getByRole('button', { name: 'Open incident' }).click();
  const card = page.getByTestId('incident-list').locator('li').first();
  await expect(card).toContainText('Lost passport at the hotel desk');
  await expect(card).toContainText('Minji Park');
  await expect(card).toContainText('Owner');
  await expect(card).toContainText('Open');
  await expect(page.getByRole('heading', { level: 1 }).locator('..')).toContainText(
    '1 open incident',
  );
  await page.mouse.move(0, 0);
  await page.screenshot({
    path: `${OUT}/${info.project.name}/safety-manual-incident.png`,
    fullPage: true,
  });

  // Sora joins from "the phone" and reads the projected card about her traveler.
  const ctx = await browser.newContext();
  const sora = await ctx.newPage();
  await signIn(sora);
  const redeem = await call(sora, 'POST', '/v1/invites/redeem', { code: soraCode });
  expect(redeem.ok, `redeem: ${redeem.status} ${redeem.text}`).toBeTruthy();
  const { organizationId, tripId } = JSON.parse(redeem.text) as {
    organizationId: string;
    tripId: string;
  };
  const mine = await call(sora, 'GET', `/v1/orgs/${organizationId}/trips/${tripId}/incidents`);
  expect(mine.ok, mine.text).toBeTruthy();
  const cards = (JSON.parse(mine.text) as { incidents: { title: string; status: string }[] })
    .incidents;
  expect(cards).toHaveLength(1);
  expect(cards[0]).toMatchObject({ title: 'Status update about Minji Park', status: 'open' });
  await ctx.close();
});
