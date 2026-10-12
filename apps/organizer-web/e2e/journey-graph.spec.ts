// Copyright 2026- At Day. All rights reserved.
// Browser facts for slice 050: with a trip that is on today, the organizer's itinerary feeds the
// journey graph (three events tomorrow, a ten-minute gap flagged at risk, the tight connection
// read off) and the command center's next-48h movements. Captures journey-graph-live.png and
// command-center-movements.png.

import { expect, type Page, test } from '@playwright/test';
import { OUT, signInWithOrg } from './helpers';

async function call(page: Page, method: 'GET' | 'POST' | 'PUT', url: string, body?: unknown) {
  return page.evaluate(
    async ({ method, url, body }) => {
      const r = await fetch(url, {
        method,
        headers: body === undefined ? {} : { 'content-type': 'application/json' },
        body: body === undefined ? null : JSON.stringify(body),
      });
      return { status: r.status, json: (await r.json()) as Record<string, unknown> };
    },
    { method, url, body },
  );
}

const dateOffset = (days: number) =>
  new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

test('journey graph and movements read the itinerary', async ({ page }, info) => {
  await signInWithOrg(page);
  const orgs = await call(page, 'GET', '/v1/orgs');
  const orgId = (orgs.json.organizations as { id: string }[])[0]?.id ?? '';
  const trip = await call(page, 'POST', `/v1/orgs/${orgId}/trips`, {
    name: 'Rome week',
    startsOn: dateOffset(-1),
    endsOn: dateOffset(6),
    timezone: 'Europe/Rome',
  });
  expect(trip.status).toBe(201);
  const base = `/v1/orgs/${orgId}/trips/${trip.json.id as string}`;
  const tomorrow = dateOffset(1);
  const event = async (
    start: string,
    end: string | null,
    kind: string,
    title: string,
    order: number,
  ) => {
    const id = crypto.randomUUID();
    const r = await call(page, 'PUT', `${base}/itinerary/events/${id}`, {
      date: tomorrow,
      start,
      end,
      timeZone: 'Europe/Rome',
      kind,
      title,
      place: 'Hotel de la Ville',
      pax: null,
      status: 'scheduled',
      note: null,
      order,
    });
    expect(r.status, `${title}: ${JSON.stringify(r.json)}`).toBe(200);
    return id;
  };
  await event('09:00', '10:00', 'meal', 'Breakfast', 1);
  const busId = await event('10:10', null, 'bus', 'Bus to Colosseum', 2);
  await event('12:30', '13:30', 'meal', 'Lunch', 3);

  await page.goto(`/journey-graph?day=${tomorrow}`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Journey Graph');
  await expect(page.getByText('Live', { exact: true })).toBeVisible();
  await expect(page.locator('[data-testid^="node-"]')).toHaveCount(3);
  await expect(page.getByTestId(`node-${busId}`)).toHaveAttribute('data-status', 'risk');
  await expect(page.locator('.page__subtitle')).toContainText('3 movements on');
  await expect(page.locator('.page__subtitle')).toContainText('1 tight connection');
  await expect(page.getByTestId('tight')).toContainText(
    '10:00 Breakfast → 10:10 Bus to Colosseum · 10 min',
  );
  await expect(page.getByText('No pending proposals from the leaders.')).toBeVisible();
  await page.mouse.move(0, 0);
  await page.screenshot({
    path: `${OUT}/${info.project.name}/journey-graph-live.png`,
    fullPage: true,
  });

  // The command center's next 48 hours carry the same events.
  await page.goto('/');
  await expect(page.getByText('Live', { exact: true }).first()).toBeVisible();
  const movements = page
    .getByRole('region', { name: 'Next 48 hours' })
    .or(page.locator('section').filter({ has: page.getByText('Next 48 hours') }));
  await expect(movements.first()).toContainText('Bus to Colosseum');
  await expect(movements.first()).toContainText('Breakfast');
  await page.screenshot({
    path: `${OUT}/${info.project.name}/command-center-movements.png`,
    fullPage: true,
  });
});
