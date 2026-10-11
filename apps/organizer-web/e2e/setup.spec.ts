// Copyright 2026- At Day. All rights reserved.
// Browser facts for slice 007 on the real API: session gate, magic-link sign-in, the four-step
// checklist end to end (org, trip, roster CSV, invite codes), sign-out. Captures each step.

import { expect, test } from '@playwright/test';
import { OUT, signIn } from './helpers';

const CSV = [
  'name,group,guardian_name,guardian_contact',
  'Minji Park,Bus A,Sora Park,sora@example.com',
  'Juho Kim,Bus A,,',
  '"Lee, Hana",Bus B,Hana Mom,hm@example.com',
].join('\n');

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

test('anonymous visitors are sent to sign-in', async ({ page }, info) => {
  await page.goto('/');
  await page.waitForURL(/\/sign-in/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Sign in');
  await page.screenshot({ path: `${OUT}/${info.project.name}/sign-in.png`, fullPage: true });
});

test('first run: sign in, org, trip, roster, invites, sign out', async ({ page }, info) => {
  const shot = async (name: string) => {
    // Sticky top bar: full-page shots render it at the current scroll offset, so go to the top.
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: `${OUT}/${info.project.name}/setup-${name}.png`,
      fullPage: true,
    });
  };

  await signIn(page);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Set up your first trip');
  await expect(page.getByTestId('setup-progress')).toHaveText('0 of 4 done');
  await expect(page.getByRole('link', { name: 'Setup' })).toHaveAttribute('aria-current', 'page');
  await shot('1-org');

  await page.getByLabel('Organization name').fill('Seoul Arts High');
  await page.getByRole('button', { name: 'Create organization' }).click();
  await expect(page.getByTestId('step-1')).toHaveAttribute('data-state', 'done');
  await expect(page.getByTestId('step-2')).toHaveAttribute('data-state', 'open');
  await expect(page.getByRole('region', { name: 'Current organization and trip' })).toContainText(
    'Seoul Arts High',
  );
  await shot('2-trip');

  await page.getByRole('button', { name: 'Use the sample trip' }).click();
  await expect(page.getByLabel('Trip name')).toHaveValue('Korea Concert Tour 2026');
  await page.getByRole('button', { name: 'Create trip' }).click();
  await expect(page.getByTestId('step-2')).toHaveAttribute('data-state', 'done');
  await expect(page.getByTestId('step-3')).toHaveAttribute('data-state', 'open');
  await expect(page.getByRole('region', { name: 'Current organization and trip' })).toContainText(
    'Korea Concert Tour 2026',
  );
  await expect(page.getByRole('region', { name: 'Current organization and trip' })).toContainText(
    'Planning',
  );
  await shot('3-roster');

  await page.getByLabel('Or paste CSV').fill(CSV);
  await page.getByRole('button', { name: 'Import rows' }).click();
  await expect(page.getByTestId('count-traveler')).toHaveText('3');
  await expect(page.getByTestId('count-guardian')).toHaveText('2');
  await page.getByLabel('Leader name').fill('Kim');
  await page.getByLabel('Group', { exact: true }).fill('Bus A');
  await page.getByRole('button', { name: 'Add leader' }).click();
  await expect(page.getByTestId('count-leader')).toHaveText('1');
  await expect(page.getByTestId('step-3')).toHaveAttribute('data-state', 'done');
  await expect(page.getByTestId('step-4')).toHaveAttribute('data-state', 'open');

  await page.getByRole('button', { name: 'Issue invite codes' }).click();
  const rows = page.getByTestId('invite-table').locator('tbody tr');
  await expect(rows).toHaveCount(6);
  await expect(rows.first().locator('code')).toHaveText(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  await expect(page.getByTestId('setup-progress')).toHaveText('3 of 4 done');
  await shot('4-invites');

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download CSV' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^voysemble-invites-.*\.csv$/);

  // Reload: the checklist is rebuilt from the API, not from memory.
  await page.reload();
  await expect(page.getByTestId('step-3')).toHaveAttribute('data-state', 'done');
  await expect(page.getByText('6 people on the roster')).toBeVisible();

  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.waitForURL(/\/sign-in/);
  const me = await page.request.get('/v1/me');
  expect(me.status()).toBe(401);
});
