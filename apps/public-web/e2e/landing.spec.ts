// Copyright 2026- At Day. All rights reserved.
// The built site, served by the assets-only Worker under `wrangler dev`: both locales, the legal
// pages, the 404, the crawler files, the language switch, the phone menu. Captures are evidence
// (docs/captures/public/<project>/).

import { expect, test } from '@playwright/test';
import { en } from '../src/site/en.ts';
import { ko } from '../src/site/ko.ts';
import { pilotHref } from '../src/site/model.ts';

const SECTIONS = ['roles', 'phones', 'features', 'trust', 'platform', 'pricing', 'faq'];

async function capture(
  page: import('@playwright/test').Page,
  project: string,
  name: string,
  fullPage = false,
) {
  // The first viewport (what a visitor sees before scrolling) at every size; the full page only
  // where asked (desktop landing), since a 14,000 px PNG is megabytes per run.
  // The page scrolls smoothly (CSS); jump instantly so the shot is the real top.
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.waitForFunction(() => window.scrollY === 0);
  await page.screenshot({ path: `../../docs/captures/public/${project}/${name}-top.png` });
  if (fullPage) {
    await page.screenshot({
      path: `../../docs/captures/public/${project}/${name}.png`,
      fullPage: true,
    });
  }
}

test('English landing: metadata, sections, captures, calls to action', async ({ page }, info) => {
  const res = await page.goto('/');
  expect(res?.status()).toBe(200);
  await expect(page).toHaveTitle(en.meta.title);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(en.hero.title);
  expect(await page.locator('html').getAttribute('lang')).toBe('en');
  expect(await page.locator('link[rel=alternate][hreflang=ko]').getAttribute('href')).toMatch(
    /\/ko\/$/,
  );
  for (const id of SECTIONS) await expect(page.locator(`#${id}`)).toHaveCount(1);
  // Every feature of every phase is on the page, with its details.
  for (const g of en.phases.groups) {
    for (const f of g.features) {
      await expect(page.locator(`#feature-${f.id} h4`)).toHaveText(f.title);
      await expect(page.locator(`#feature-${f.id} .bullets li`)).toHaveCount(f.details.length);
    }
  }
  // The hero capture is a real image that decoded.
  const hero = page.locator('.hero img');
  await expect(hero).toBeVisible();
  expect(await hero.evaluate((img) => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(
    1000,
  );
  // The phone gallery (slice 040): every shot is a real image that decoded.
  const shots = page.locator('#phones .shot img');
  await expect(shots).toHaveCount(en.phones.shots.length);
  for (let i = 0; i < en.phones.shots.length; i++) {
    await shots.nth(i).scrollIntoViewIfNeeded();
    expect(
      await shots.nth(i).evaluate((img) => (img as HTMLImageElement).naturalWidth),
    ).toBeGreaterThan(300);
  }
  // Calls to action.
  await expect(page.locator('[data-cta=pilot]')).toHaveAttribute('href', pilotHref('en'));
  await expect(page.locator('[data-cta=console]')).toHaveAttribute(
    'href',
    'https://app.voysemble.com/',
  );
  // FAQ opens.
  const first = page.locator('.faq__item').first();
  await first.locator('summary').click();
  await expect(first).toHaveAttribute('open', '');
  await capture(page, info.project.name, 'landing-en', info.project.name === 'desktop-1440');
});

test('Korean landing via the language switch; switch back', async ({ page }, info) => {
  await page.goto('/');
  if (info.project.name === 'phone-390')
    await page.getByRole('button', { name: en.nav.menu }).click();
  await page.locator('[data-lang-switch]').click();
  await expect(page).toHaveURL(/\/ko\/$/);
  expect(await page.locator('html').getAttribute('lang')).toBe('ko');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(ko.hero.title);
  await expect(page.locator('#feature-headcount h4')).toHaveText('버스 안에서 마감되는 인원 점검');
  await capture(page, info.project.name, 'landing-ko', info.project.name === 'desktop-1440');
  if (info.project.name === 'phone-390')
    await page.getByRole('button', { name: ko.nav.menu }).click();
  await page.locator('[data-lang-switch]').click();
  await expect(page).toHaveURL(/\/$/);
  expect(await page.locator('html').getAttribute('lang')).toBe('en');
});

test('directory paths, legal pages, crawler files, 404', async ({ page, request }, info) => {
  // auto-trailing-slash: /ko redirects to /ko/.
  const redirected = await page.goto('/ko');
  expect(redirected?.url()).toMatch(/\/ko\/$/);
  for (const [path, title] of [
    ['/privacy/', 'Privacy policy'],
    ['/terms/', 'Terms of service'],
    ['/ko/privacy/', '개인정보 처리방침'],
    ['/ko/terms/', '이용약관'],
  ] as const) {
    const res = await page.goto(path);
    expect(res?.status(), path).toBe(200);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);
    await expect(page.locator('.notice--draft')).toBeVisible();
  }
  await capture(page, info.project.name, 'privacy-en').catch(() => undefined);
  const robots = await request.get('/robots.txt');
  expect(robots.status()).toBe(200);
  expect(await robots.text()).toContain('Sitemap: https://voysemble.com/sitemap.xml');
  const sitemap = await request.get('/sitemap.xml');
  expect(sitemap.status()).toBe(200);
  expect((await sitemap.text()).match(/<url>/g)?.length).toBe(6);
  const missing = await request.get('/no-such-page');
  expect(missing.status()).toBe(404);
  expect(await missing.text()).toContain('Page not found');
  const headers = (await request.get('/')).headers();
  expect(headers['x-content-type-options']).toBe('nosniff');
});

test('phone: the menu opens and the page has no horizontal overflow', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone-390', 'phone project only');
  await page.goto('/');
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  const button = page.getByRole('button', { name: en.nav.menu });
  await expect(page.locator('#site-nav')).toBeHidden();
  await button.click();
  await expect(button).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#site-nav')).toBeVisible();
  await page.locator('#site-nav a[href="#pricing"]').click();
  await expect(page.locator('#site-nav')).toBeHidden();
  await expect(page.locator('#pricing')).toBeInViewport();
});
