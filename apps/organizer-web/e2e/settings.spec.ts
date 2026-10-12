// Copyright 2026- At Day. All rights reserved.
// Browser facts for slice 036: Settings is live once the account has an organization; the owner
// renames it, moves the quiet hours and the wrap-up window, each card says "Saved." and the
// values survive a reload; the members card lists the owner with "you". Capture settings-live.png.

import { expect, test } from '@playwright/test';
import { OUT, signInWithOrg } from './helpers';

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

test('settings: the owner edits the organization and the values persist', async ({
  page,
}, info) => {
  await signInWithOrg(page);
  await page.goto('/settings');
  await expect(page.getByText('Live', { exact: true })).toBeVisible();

  // Slice 069: the account's own name; the Today page greets by it.
  const account = page.getByRole('form', { name: 'Your account' });
  await account.getByLabel('Your name').fill('Nate Kim');
  await account.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByTestId('settings-account-status')).toHaveText('Saved.');
  await expect(page.getByRole('button', { name: 'Account: Nate Kim' })).toHaveText('NA');

  // Profile: defaults from the decisions, then a rename and a new zone.
  const profile = page.getByRole('form', { name: 'Organization' });
  await expect(profile.getByLabel('Name')).toHaveValue('Seoul Arts High');
  await expect(profile.getByLabel('Time zone')).toHaveValue('Asia/Seoul');
  await profile.getByLabel('Name').fill('Seoul Arts High School');
  await profile.getByLabel('Time zone').fill('Europe/Rome');
  await profile.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByTestId('settings-profile-status')).toHaveText('Saved.');
  // The shell's organization name follows.
  await expect(page.getByText('Seoul Arts High School').first()).toBeVisible();

  // Notifications: quiet hours and the digest hour (D29).
  const notif = page.getByRole('form', { name: 'Notification rules' });
  await expect(notif.getByLabel('Quiet hours from')).toHaveValue('23:00');
  await notif.getByLabel('Quiet hours from').fill('22:30');
  await notif.getByLabel('Guardian digest at').fill('18:00');
  await notif.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByTestId('settings-notif-status')).toHaveText('Saved.');

  // Retention: the window is checked on the client before the call (D20).
  const retention = page.getByRole('form', { name: 'Retention' });
  await retention.getByLabel('Wrap-up window after trip close (days)').fill('10');
  await retention.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByTestId('settings-retention-status')).toHaveText(
    'Between 30 and 365 days.',
  );
  await retention.getByLabel('Wrap-up window after trip close (days)').fill('120');
  await retention.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByTestId('settings-retention-status')).toHaveText('Saved.');

  // Members: the owner, marked as you.
  const owner = page.getByTestId('member-owner');
  await expect(owner).toContainText('@example.com');
  await expect(owner).toContainText('you');
  await expect(owner).toContainText('Owner');

  await page.mouse.move(0, 0);
  await page.screenshot({ path: `${OUT}/${info.project.name}/settings-live.png`, fullPage: true });

  // Everything survives a reload.
  await page.reload();
  await expect(page.getByText('Live', { exact: true })).toBeVisible();
  await expect(page.getByRole('form', { name: 'Organization' }).getByLabel('Name')).toHaveValue(
    'Seoul Arts High School',
  );
  await expect(
    page.getByRole('form', { name: 'Organization' }).getByLabel('Time zone'),
  ).toHaveValue('Europe/Rome');
  await expect(
    page.getByRole('form', { name: 'Notification rules' }).getByLabel('Quiet hours from'),
  ).toHaveValue('22:30');
  await expect(
    page.getByRole('form', { name: 'Notification rules' }).getByLabel('Guardian digest at'),
  ).toHaveValue('18:00');
  await expect(
    page
      .getByRole('form', { name: 'Retention' })
      .getByLabel('Wrap-up window after trip close (days)'),
  ).toHaveValue('120');
});
