// Copyright 2026- At Day. All rights reserved.
// Tablet (1024x768) and phone (390x844) captures of the key pages, plus the phone nav drawer.
// Runs only in the tablet-1024 and phone-390 projects (playwright.config.ts testMatch).

import { expect, test } from '@playwright/test';
import { OUT, signInWithOrg } from './helpers';

const PAGES = ['/', '/itinerary?day=2026-12-31', '/people', '/safety', '/reports', '/setup'];

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await signInWithOrg(page);
});

for (const path of PAGES) {
  test(`responsive ${path}`, async ({ page }, info) => {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    // No horizontal page scroll at any width.
    const overflow = await page.evaluate(() => {
      const limit = document.documentElement.clientWidth;
      const offenders = [...document.querySelectorAll('body *')]
        .filter((el) => el.getBoundingClientRect().right > limit + 1)
        .slice(0, 6)
        .map((el) => `${el.tagName.toLowerCase()}.${[...el.classList].join('.')}`);
      return { px: document.documentElement.scrollWidth - limit, offenders };
    });
    expect(overflow.px, `overflowing: ${overflow.offenders.join(', ')}`).toBeLessThanOrEqual(0);
    const name = path === '/' ? 'command-center' : path.slice(1).split('?')[0];
    await page.screenshot({ path: `${OUT}/${info.project.name}/${name}.png`, fullPage: true });
  });
}

test('phone: menu button opens the drawer and navigation closes it', async ({ page }, info) => {
  test.skip(!info.project.name.startsWith('phone'), 'drawer exists only at phone width');
  await page.goto('/');
  const menu = page.getByRole('button', { name: 'Menu', exact: true });
  await expect(menu).toBeVisible();
  await menu.click();
  await expect(menu).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('navigation', { name: 'Sections' })).toBeInViewport();
  await page.screenshot({ path: `${OUT}/${info.project.name}/nav-drawer.png` });
  await page.getByRole('link', { name: 'Safety' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Safety');
  await expect(menu).toHaveAttribute('aria-expanded', 'false');
});
