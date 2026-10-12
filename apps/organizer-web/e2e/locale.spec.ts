// Copyright 2026- At Day. All rights reserved.
// Browser facts for slice 038: the console speaks Korean after one tap on the top-bar toggle, the
// choice survives a reload (stored, and saved on the account), every page reads its strings in
// Korean, and the toggle brings English back. Captures command-center-ko.png and people-ko.png.

import { expect, test } from '@playwright/test';
import { OUT, signInWithOrg } from './helpers';

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

test('korean console: toggle, persistence, pages, back to english', async ({ page }, info) => {
  await signInWithOrg(page);
  await page.getByRole('button', { name: 'Use the sample trip' }).click();
  await page.getByRole('button', { name: 'Create trip' }).click();
  await expect(page.getByTestId('step-3')).toHaveAttribute('data-state', 'open');
  await page
    .getByLabel('Or paste CSV')
    .fill('name,group,guardian_name,guardian_contact\nMinji Park,Bus A,Sora Park,sora@example.com');
  await page.getByRole('button', { name: 'Import rows' }).click();
  await expect(page.getByTestId('count-traveler')).toHaveText('1');

  // The toggle offers the other language in that language.
  const toggle = page.getByTestId('locale-toggle');
  await expect(toggle).toHaveText('한국어');
  await toggle.click();
  await expect(toggle).toHaveText('English');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ko');
  await expect(page.getByRole('link', { name: '사람', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: '설정', exact: true })).toBeVisible();

  // The account remembers it: a reload (new document, stored choice and /v1/me agree) stays Korean.
  await page.reload();
  await expect(page.getByTestId('locale-toggle')).toHaveText('English');
  // Through the page (same cookie jar and dev proxy as the console itself).
  const me = await page.evaluate(() =>
    fetch('/v1/me').then((r) => r.json() as Promise<{ locale: string }>),
  );
  expect(me.locale).toBe('ko');

  await page.goto('/');
  await expect(page.getByRole('link', { name: '오늘', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(page.getByText('진행 중인 여행', { exact: true })).toBeVisible();
  await page.mouse.move(0, 0);
  await page.screenshot({
    path: `${OUT}/${info.project.name}/command-center-ko.png`,
    fullPage: true,
  });

  await page.goto('/people');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('사람');
  await expect(page.getByText('실시간', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('cell', { name: '이름', exact: true })).toBeVisible();
  await expect(page.getByText('Minji Park의 보호자')).toBeVisible();
  await page.mouse.move(0, 0);
  await page.screenshot({ path: `${OUT}/${info.project.name}/people-ko.png`, fullPage: true });

  await page.goto('/settings');
  await expect(page.getByRole('form', { name: '조직' }).getByLabel('이름')).toHaveValue(
    'Seoul Arts High',
  );

  // Back to English.
  await page.getByTestId('locale-toggle').click();
  await expect(page.getByRole('link', { name: 'People', exact: true })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
});
