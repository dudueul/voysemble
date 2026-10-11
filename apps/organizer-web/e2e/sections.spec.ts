// Copyright 2026- At Day. All rights reserved.
// Browser facts and captures for the ten sample sections (slice 008). Each page shows the
// "Sample data" chip, its nav item is current, and one fixture-derived fact is visible.

import { expect, test } from '@playwright/test';
import { OUT, signInWithOrg } from './helpers';

const SECTIONS: {
  path: string;
  nav: string;
  fact: (p: import('@playwright/test').Page) => Promise<void>;
}[] = [
  {
    path: '/people',
    nav: 'People',
    fact: async (p) => expect(p.getByTestId('people-joined')).toHaveText('61'),
  },
  {
    path: '/communication',
    nav: 'Communication',
    fact: async (p) =>
      expect(p.getByRole('status')).toContainText('Create an organization and a trip first.'),
  },
  {
    path: '/safety',
    nav: 'Safety',
    fact: async (p) => expect(p.getByTestId('win-inside')).toHaveText('6'),
  },
  {
    path: '/journey-graph',
    nav: 'Journey Graph',
    fact: async (p) => expect(p.getByTestId('node-n3')).toBeVisible(),
  },
  {
    path: '/travel',
    nav: 'Travel',
    fact: async (p) => expect(p.getByTestId('flight-list').getByRole('listitem')).toHaveCount(2),
  },
  {
    path: '/media',
    nav: 'Media',
    fact: async (p) => expect(p.getByTestId('media-queue').getByRole('listitem')).toHaveCount(3),
  },
  {
    path: '/preparation',
    nav: 'Preparation',
    fact: async (p) => expect(p.getByTestId('doc-d2')).toHaveText('36/38'),
  },
  {
    path: '/reports',
    nav: 'Reports',
    fact: async (p) => expect(p.getByTestId('kpi-Average ack rate')).toHaveText('86%'),
  },
  {
    path: '/billing',
    nav: 'Billing',
    fact: async (p) => expect(p.getByTestId('ledger-table').locator('tbody tr')).toHaveCount(6),
  },
  {
    path: '/settings',
    nav: 'Settings',
    fact: async (p) => expect(p.getByTestId('member-list').getByRole('listitem')).toHaveCount(3),
  },
];

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await signInWithOrg(page);
});

for (const s of SECTIONS) {
  test(`section ${s.path} renders sample data`, async ({ page }, info) => {
    await page.goto(s.path);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(s.nav);
    await expect(page.getByText('Sample data')).toBeVisible();
    await expect(page.getByRole('link', { name: s.nav, exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await s.fact(page);
    // Park the pointer so no hover tooltip leaks into the capture.
    await page.mouse.move(0, 0);
    await page.screenshot({
      path: `${OUT}/${info.project.name}/${s.path.slice(1)}.png`,
      fullPage: true,
    });
  });
}

test('reports: hovering a bar shows a tooltip; table view opens', async ({ page }) => {
  await page.goto('/reports');
  await page.getByRole('button', { name: 'D3: 92%' }).hover();
  await expect(page.locator('.chart__tip')).toHaveCount(1);
  await page.getByText('Table view').first().click();
  await expect(page.getByRole('row', { name: /D1 71%/ })).toBeVisible();
});

test('unknown sections stay honest placeholders', async ({ page }) => {
  await page.goto('/not-built');
  await expect(page.getByRole('status')).toContainText('not built yet');
});
