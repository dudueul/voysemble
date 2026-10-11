// Copyright 2026- At Day. All rights reserved.
// Browser facts for slice 010: an organizer publishes from Communication on the real API, sees
// the ack meter against the roster, and the unacked names; a redeemed traveler's ack moves the
// count. The traveler's ack is sent through the API (the mobile app is the traveler client).

import { expect, type Page, test } from '@playwright/test';
import { OUT, signIn, signInWithOrg } from './helpers';

/** Same-origin fetch from inside the page so the HttpOnly session cookie travels (Playwright's
 *  request context does not send Secure cookies to http://127.0.0.1). */
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
  'Minji Park,Bus A,,',
  'Juho Kim,Bus A,,',
].join('\n');

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

test('publish, ack progress, unacked names', async ({ page, browser }, info) => {
  await signInWithOrg(page);
  await page.getByRole('button', { name: 'Use the sample trip' }).click();
  await page.getByRole('button', { name: 'Create trip' }).click();
  await expect(page.getByTestId('step-3')).toHaveAttribute('data-state', 'open');
  await page.getByLabel('Or paste CSV').fill(CSV);
  await page.getByRole('button', { name: 'Import rows' }).click();
  await expect(page.getByTestId('count-traveler')).toHaveText('2');
  await page.getByRole('button', { name: 'Issue invite codes' }).click();
  const code = await page
    .getByTestId('invite-table')
    .locator('tbody tr', { hasText: 'Minji Park' })
    .locator('code')
    .textContent();

  await page.goto('/communication');
  await expect(page.getByRole('status')).toContainText('No announcements yet');
  await page.getByLabel('Title').fill('Breakfast moved to 06:30');
  await page.getByLabel('Message').fill('Lobby. Bus leaves 07:15.');
  await page.getByRole('button', { name: 'Publish' }).click();
  const row = page.getByTestId('announcement-list').getByRole('listitem').first();
  await expect(row).toContainText('Breakfast moved to 06:30');
  await expect(row.getByTestId(/^ack-/)).toHaveText('0/2');
  // Slice 015: translated once at publish (fixture AI port locally), labelled machine.
  await expect(row.getByTestId(/^translation-/)).toContainText('Machine translation · 한국어');
  await expect(row.getByTestId(/^translation-/)).toContainText('로비. 버스는 07:15에 출발합니다.');
  await row.getByRole('button', { name: 'Who has not?' }).click();
  await expect(row.getByTestId(/^unacked-/)).toContainText('Juho Kim, Minji Park');
  await page.mouse.move(0, 0);
  await page.screenshot({
    path: `${OUT}/${info.project.name}/communication-live.png`,
    fullPage: true,
  });

  // Minji joins in a second browser context and acks through the API.
  const ctx = await browser.newContext();
  const minji = await ctx.newPage();
  await signIn(minji);
  const redeem = await call(minji, 'POST', '/v1/invites/redeem', { code });
  expect(redeem.ok, `redeem ${code}: ${redeem.status} ${redeem.text}`).toBeTruthy();
  const { organizationId, tripId } = JSON.parse(redeem.text) as {
    organizationId: string;
    tripId: string;
  };
  const list = await call(minji, 'GET', `/v1/orgs/${organizationId}/trips/${tripId}/announcements`);
  const { announcements } = JSON.parse(list.text) as { announcements: { id: string }[] };
  const ack = await call(
    minji,
    'POST',
    `/v1/orgs/${organizationId}/trips/${tripId}/announcements/${announcements[0]?.id}/ack`,
    { ackedAtDevice: new Date().toISOString() },
  );
  expect(ack.ok, `ack: ${ack.status} ${ack.text}`).toBeTruthy();
  await ctx.close();

  await page.reload();
  const after = page.getByTestId('announcement-list').getByRole('listitem').first();
  await expect(after.getByTestId(/^ack-/)).toHaveText('1/2');
  await after.getByRole('button', { name: 'Who has not?' }).click();
  await expect(after.getByTestId(/^unacked-/)).toContainText('Juho Kim');
  await expect(after.getByTestId(/^unacked-/)).not.toContainText('Minji');
});
