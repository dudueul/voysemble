// Copyright 2026- At Day. All rights reserved.
// Browser facts + captures for the itinerary editor (second visual-acceptance screen).

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

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await signInWithOrg(page);
});

test('itinerary editor: day rail, timeline, edit, publish', async ({ page }, info) => {
  await page.goto('/itinerary?day=2026-12-31');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Itinerary');
  await expect(page.getByRole('link', { name: 'Itinerary' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(page.getByRole('navigation', { name: 'Days' }).getByRole('button')).toHaveCount(13);
  await page.getByRole('button', { name: '09:00 Colosseum guided tour' }).click();
  await expect(page.getByLabel('Title')).toHaveValue('Colosseum guided tour');
  await page.screenshot({ path: `${OUT}/${info.project.name}/itinerary.png`, fullPage: true });

  await page.getByLabel('Note for travelers').fill('Bring the group ticket printout.');
  await expect(page.getByTestId('drafts')).toHaveText('1 unpublished change');
  await page.screenshot({
    path: `${OUT}/${info.project.name}/itinerary-draft.png`,
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Publish changes' }).click();
  await expect(page.getByTestId('revision')).toHaveText('Revision 8');
  await expect(page.getByTestId('drafts')).toHaveText('All changes published');
});

test('itinerary: selecting a day updates the URL', async ({ page }) => {
  await page.goto('/itinerary');
  await page.getByRole('button', { name: /Day 5 · Concert/ }).click();
  await expect(page).toHaveURL(/day=2027-01-01/);
  await expect(
    page.getByRole('button', { name: '17:40 DEMO 086 arrives (late joiners)' }),
  ).toBeVisible();
});

for (const state of ['loading', 'empty', 'error'] as const) {
  test(`itinerary state: ${state}`, async ({ page }, info) => {
    await page.goto(`/itinerary?state=${state}`);
    if (state === 'loading')
      await expect(page.getByRole('main')).toHaveAttribute('aria-busy', 'true');
    if (state === 'empty')
      await expect(page.getByRole('status')).toContainText('No days in this trip yet');
    if (state === 'error')
      await expect(page.getByRole('alert')).toContainText('corr-fixture-itinerary');
    await page.screenshot({
      path: `${OUT}/${info.project.name}/itinerary-${state}.png`,
      fullPage: true,
    });
  });
}

test('live itinerary: add, edit, publish, persist (slice 017)', async ({ page }, info) => {
  await page.getByRole('button', { name: 'Use the sample trip' }).click();
  await page.getByRole('button', { name: 'Create trip' }).click();
  await expect(page.getByTestId('step-3')).toHaveAttribute('data-state', 'open');

  await page.goto('/itinerary');
  await expect(page.getByText('Live', { exact: true })).toBeVisible();
  await expect(page.getByTestId('revision')).toHaveText('Revision 0');
  await expect(page.getByRole('navigation', { name: 'Days' }).getByRole('button')).toHaveCount(13);
  await expect(page.getByText('No events on this day yet.')).toBeVisible();

  await page.getByRole('button', { name: 'Add event' }).click();
  await page.getByLabel('Title').fill('Group check-in');
  await page.getByLabel('Place', { exact: true }).fill('ICN Terminal 2, counter K');
  await expect(page.getByTestId('drafts')).toHaveText('1 unpublished change');
  await page.getByRole('button', { name: 'Publish changes' }).click();
  await expect(page.getByTestId('revision')).toHaveText('Revision 1');
  await expect(page.getByTestId('drafts')).toHaveText('All changes published');
  await page.mouse.move(0, 0);
  await page.screenshot({ path: `${OUT}/${info.project.name}/itinerary-live.png`, fullPage: true });

  await page.reload();
  await expect(page.getByTestId('revision')).toHaveText('Revision 1');
  await expect(page.getByRole('button', { name: '09:00 Group check-in' })).toBeVisible();
  await expect(page.getByTestId('itinerary-notice')).toHaveCount(0);

  // Slice 020: revision 2 with a change on a current day notifies travelers with the diff.
  await page.getByRole('button', { name: '09:00 Group check-in' }).click();
  await page.getByLabel('Start').fill('08:30');
  await page.getByLabel('Note for travelers (optional)').fill('Please be early.');
  await expect(page.getByTestId('drafts')).toHaveText('1 unpublished change');
  await page.getByRole('button', { name: 'Publish changes' }).click();
  await expect(page.getByTestId('revision')).toHaveText('Revision 2');
  await expect(page.getByTestId('publish-status')).toHaveText(
    'Revision 2 published · 1 change · travelers notified',
  );
  await page.goto('/communication');
  const rev = page.getByTestId('announcement-list').getByRole('listitem').first();
  await expect(rev.getByTestId(/^revision-chip-/)).toHaveText('Itinerary update · revision 2');
  await expect(rev).toContainText('Day 1 · Group check-in · 09:00 → 08:30');
  await expect(rev).toContainText('Please be early.');
  await expect(rev.getByTestId(/^ack-/)).toHaveText('0/0');
});

test('leader proposal: filed from the phone, accepted on the console (slice 018)', async ({
  page,
  browser,
}, info) => {
  await page.getByRole('button', { name: 'Use the sample trip' }).click();
  await page.getByRole('button', { name: 'Create trip' }).click();
  await expect(page.getByTestId('step-3')).toHaveAttribute('data-state', 'open');
  await page
    .getByLabel('Or paste CSV')
    .fill('name,group,guardian_name,guardian_contact\nMinji Park,Bus A,,');
  await page.getByRole('button', { name: 'Import rows' }).click();
  await expect(page.getByTestId('count-traveler')).toHaveText('1');
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

  // The organizer publishes one event.
  await page.goto('/itinerary');
  await page.getByRole('button', { name: 'Add event' }).click();
  await page.getByLabel('Title').fill('Colosseum guided tour');
  await page.getByRole('button', { name: 'Publish changes' }).click();
  await expect(page.getByTestId('revision')).toHaveText('Revision 1');

  // Kim proposes an earlier start from "the phone".
  const ctx = await browser.newContext();
  const kim = await ctx.newPage();
  await signIn(kim);
  const redeem = await call(kim, 'POST', '/v1/invites/redeem', { code });
  expect(redeem.ok, `redeem: ${redeem.status} ${redeem.text}`).toBeTruthy();
  const { organizationId, tripId } = JSON.parse(redeem.text) as {
    organizationId: string;
    tripId: string;
  };
  const published = await call(kim, 'GET', `/v1/orgs/${organizationId}/trips/${tripId}/itinerary`);
  const { events } = JSON.parse(published.text) as { events: { id: string }[] };
  const filed = await call(
    kim,
    'POST',
    `/v1/orgs/${organizationId}/trips/${tripId}/itinerary/proposals`,
    {
      kind: 'edit',
      eventId: events[0]?.id,
      patch: { start: '08:30' },
      note: 'Guide asked us to come 30 min earlier.',
    },
  );
  expect(filed.ok, `proposal: ${filed.status} ${filed.text}`).toBeTruthy();
  await ctx.close();

  await page.reload();
  const panel = page.getByTestId('proposals');
  await expect(panel).toContainText('1 change proposal from a leader');
  await expect(panel).toContainText('start: 08:30');
  await expect(panel).toContainText('Guide asked us to come 30 min earlier.');
  await page.mouse.move(0, 0);
  await page.screenshot({
    path: `${OUT}/${info.project.name}/itinerary-proposal.png`,
    fullPage: true,
  });
  await panel.getByRole('button', { name: 'Accept' }).click();
  await expect(panel).toContainText('accepted by Organizer');
  await expect(page.getByTestId('drafts')).toHaveText('1 unpublished change');
  await expect(page.getByRole('button', { name: '08:30 Colosseum guided tour' })).toBeVisible();
  await page.getByRole('button', { name: 'Publish changes' }).click();
  await expect(page.getByTestId('revision')).toHaveText('Revision 2');
});
