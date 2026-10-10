// Copyright 2026- At Day. All rights reserved.
// Browser facts + visual evidence. Screenshots land in docs/captures/web/<project>/ and are the
// artifacts the visual-acceptance review compares against docs/visual-references/.

import { expect, test } from '@playwright/test';

const OUT = '../../docs/captures/web';

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

test('command center renders fixture and sidebar', async ({ page }, info) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Welcome back, Nathan');
  await expect(page.getByTestId('hc-total')).toHaveText('34/38');
  await expect(page.getByRole('navigation', { name: 'Sections' }).getByRole('link')).toHaveCount(
    12,
  );
  await expect(page.getByRole('link', { name: 'Today' })).toHaveAttribute('aria-current', 'page');
  await page.screenshot({ path: `${OUT}/${info.project.name}/command-center.png`, fullPage: true });
});

for (const state of ['loading', 'empty', 'error', 'offline'] as const) {
  test(`command center state: ${state}`, async ({ page }, info) => {
    await page.goto(`/?state=${state}`);
    if (state === 'loading')
      await expect(page.getByRole('main')).toHaveAttribute('aria-busy', 'true');
    if (state === 'empty') await expect(page.getByRole('status')).toContainText('No trips yet');
    if (state === 'error')
      await expect(page.getByRole('alert')).toContainText('corr-fixture-error');
    if (state === 'offline')
      await expect(page.getByRole('status')).toContainText('You are offline');
    await page.screenshot({
      path: `${OUT}/${info.project.name}/command-center-${state}.png`,
      fullPage: true,
    });
  });
}

test('placeholder sections are honest', async ({ page }) => {
  await page.goto('/billing');
  await expect(page.getByRole('status')).toContainText('not built yet');
});
