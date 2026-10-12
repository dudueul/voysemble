// Copyright 2026- At Day. All rights reserved.
// Browser facts for slice 046 (D37): the organizer adds a flight, marks it delayed, adds a hotel
// (the row reads the nights), adds a bus riding group Bus A (its seats follow the roster: two of
// twenty-four), then removes the hotel. Capture travel-live.png with the three bookings in place.
// Slice 049 (D39): mints the driver's link for the bus, opens it with no session (the sheet lists
// the bus's names only; capture driver-sheet.png), sees the open counted, revokes it, and the
// sheet says the link no longer works.

import { expect, type Page, test } from '@playwright/test';
import { OUT, signInWithOrg } from './helpers';

const CSV =
  'name,group,guardian_name,guardian_contact\nMinji Park,Bus A,Sora Park,sora@example.com\nJuho Kim,Bus A,,\nLee Hana,Bus B,,';

async function call(page: Page, method: 'GET' | 'POST', url: string, body?: unknown) {
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

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

test('travel: a flight with its status, a hotel with its nights, a bus with its roster seats', async ({
  page,
}, info) => {
  await signInWithOrg(page);
  const orgs = await call(page, 'GET', '/v1/orgs');
  const orgId = (orgs.json.organizations as { id: string }[])[0]?.id ?? '';
  const trip = await call(page, 'POST', `/v1/orgs/${orgId}/trips`, {
    name: 'Korea Concert Tour 2026',
    startsOn: '2026-12-26',
    endsOn: '2027-01-07',
    timezone: 'Europe/Rome',
  });
  expect(trip.status).toBe(201);
  const base = `/v1/orgs/${orgId}/trips/${trip.json.id as string}`;
  expect((await call(page, 'POST', `${base}/roster/import`, { csv: CSV })).status).toBe(201);

  await page.goto('/travel');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Travel');
  await expect(page.getByText('Live', { exact: true })).toBeVisible();
  await expect(page.getByText('No flights yet', { exact: false })).toBeVisible();
  await expect(page.locator('.page__subtitle')).toHaveText(
    '0 flights · 0 hotels · 0 buses · 3 travelers to move',
  );

  // A flight, then delayed.
  const flightForm = page.getByRole('form', { name: 'Add a flight' });
  await flightForm.getByLabel('Flight').fill('DEMO 901');
  await flightForm.getByLabel('From').fill('ICN');
  await flightForm.getByLabel('To').fill('FCO');
  await flightForm.getByLabel('Departs').fill('2026-12-28T13:30');
  await flightForm.getByLabel('Arrives').fill('2026-12-28T18:55');
  await flightForm.getByLabel('Seats').fill('42');
  await flightForm.getByLabel('PNR').fill('VYS8K2');
  await flightForm.getByRole('button', { name: 'Add' }).click();
  const flight = page.getByTestId('flight-list').locator('li').filter({ hasText: 'DEMO 901' });
  await expect(flight).toContainText('ICN → FCO');
  await expect(flight).toContainText('13:30 → 18:55');
  await expect(flight).toContainText('PNR VYS8K2');
  await expect(flight).toContainText('42 seats');
  await expect(flight.locator('.chip')).toHaveText('Scheduled');
  await page.getByLabel('Status of DEMO 901').selectOption('delayed');
  await expect(flight.locator('.chip')).toHaveText('Delayed');
  await expect(flight).toContainText('42 seats');
  await expect(flight).toContainText('PNR VYS8K2');

  // A hotel: five nights.
  const hotelForm = page.getByRole('form', { name: 'Add a hotel' });
  await hotelForm.getByLabel('Hotel').fill('Hotel de la Ville');
  await hotelForm.getByLabel('City').fill('Rome');
  await hotelForm.getByLabel('Check-in').fill('2026-12-28');
  await hotelForm.getByLabel('Check-out').fill('2027-01-02');
  await hotelForm.getByLabel('Rooms').fill('21');
  await hotelForm.getByLabel('Confirmation').fill('HDLV-2026-1228');
  await hotelForm.getByRole('button', { name: 'Add' }).click();
  const hotel = page
    .getByTestId('hotel-list')
    .locator('li')
    .filter({ hasText: 'Hotel de la Ville' });
  await expect(hotel).toContainText('Rome · 2026-12-28 → 2027-01-02 · 5 nights');
  await expect(hotel).toContainText('21 rooms · HDLV-2026-1228');

  // A bus riding group Bus A: two of the roster's three ride it.
  const busForm = page.getByRole('form', { name: 'Add a bus' });
  await busForm.getByLabel('Bus', { exact: true }).fill('Bus A');
  await busForm.getByLabel('Company').fill('Roma Coach');
  await busForm.getByLabel('Seats').fill('24');
  await busForm.getByLabel('Driver contact').fill('+39 333 000 0000');
  await busForm.getByTestId('bus-groups').getByLabel('Bus A').check();
  await busForm.getByRole('button', { name: 'Add' }).click();
  const bus = page.getByTestId('bus-list').locator('li').filter({ hasText: 'Roma Coach' });
  await expect(bus).toContainText('2 of 24 seats assigned');
  await expect(bus).toContainText('Groups: Bus A');
  await expect(page.locator('.page__subtitle')).toHaveText(
    '1 flights · 1 hotels · 1 buses · 3 travelers to move',
  );

  // The driver's link: minted once, opened without a session, counted, revoked.
  await page.getByRole('button', { name: 'Driver link for Bus A' }).click();
  const url = await page.getByTestId('driver-link-url').inputValue();
  expect(url).toMatch(/\/driver\/[0-9a-f-]{36}#token=[A-Za-z0-9_-]{40,}$/);
  await expect(page.getByTestId('driver-links')).toContainText('0 opens');

  await page.mouse.move(0, 0);
  await page.screenshot({
    path: `${OUT}/${info.project.name}/travel-live.png`,
    fullPage: true,
  });

  const driverCtx = await page.context().browser()?.newContext();
  if (!driverCtx) throw new Error('no browser for the driver context');
  const driver = await driverCtx.newPage();
  await driver.goto(url);
  await expect(driver.getByTestId('driver-bus')).toHaveText('Bus A · Roma Coach');
  const group = driver.getByTestId('driver-group-Bus A');
  await expect(group).toContainText('Minji Park');
  await expect(group).toContainText('Juho Kim');
  await expect(driver.getByText('Lee Hana')).toHaveCount(0);
  await expect(driver.getByText('+39 333 000 0000')).toHaveCount(0);
  await expect(driver.getByText('Names only', { exact: false })).toBeVisible();
  await driver.screenshot({
    path: `${OUT}/${info.project.name}/driver-sheet.png`,
    fullPage: true,
  });

  await page.reload();
  await expect(page.getByText('Live', { exact: true })).toBeVisible();
  await expect(page.getByTestId('driver-links')).toContainText('1 opens');
  await page.getByRole('button', { name: /^Revoke the link minted/ }).click();
  await expect(page.getByTestId('driver-links')).toContainText('Revoked');
  await driver.reload();
  await expect(driver.getByRole('alert')).toContainText('This link no longer works');
  await driverCtx.close();

  // Remove the hotel; the card goes back to its empty line.
  await page.getByRole('button', { name: 'Remove Hotel de la Ville' }).click();
  await expect(page.getByText('No hotels yet.')).toBeVisible();
  await expect(page.locator('.page__subtitle')).toHaveText(
    '1 flights · 0 hotels · 1 buses · 3 travelers to move',
  );
});
