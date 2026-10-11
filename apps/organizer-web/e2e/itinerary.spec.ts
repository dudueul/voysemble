// Copyright 2026- At Day. All rights reserved.
// Browser facts + captures for the itinerary editor (second visual-acceptance screen).

import { expect, test } from '@playwright/test';
import { OUT, signInWithOrg } from './helpers';

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
});
