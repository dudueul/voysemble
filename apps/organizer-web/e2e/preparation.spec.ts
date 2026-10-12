// Copyright 2026- At Day. All rights reserved.
// Browser facts for slice 045 (D27, D35, D36): the organizer adds a requirement, opens it, marks
// Minji collected, uploads a PNG scan for Juho; the first reveal asks for a confirmation and emails
// the link; opening the link confirms and returns to Preparation; the second reveal shows the scan
// under a watermark with the organizer's address; the reveal count reads 1; the Reports tile reads
// the completion. Capture preparation-live.png with the viewer open. Slice 048 (D38): the packing
// checklist on the same page: two items, Minji ticks one from "her phone" (the API as a traveler),
// the organizer sees the count and her progress. Capture preparation-packing.png.

import { deflateSync } from 'node:zlib';
import { expect, type Page, test } from '@playwright/test';
import { OUT, signIn, signInWithOrg } from './helpers';

const CSV =
  'name,group,guardian_name,guardian_contact\nMinji Park,Bus A,Sora Park,sora@example.com\nJuho Kim,Bus A,,\nLee Hana,Bus B,,';

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Buffer {
  const head = Buffer.alloc(4);
  head.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), Buffer.from(data)]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([head, body, crc]);
}

/** A valid solid-colour RGB PNG the browser decodes, with a text chunk the server strips. */
function png(width: number, height: number, rgb: [number, number, number]) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const raw = Buffer.alloc(height * (1 + width * 3));
  for (let y = 0; y < height; y++) {
    const row = y * (1 + width * 3);
    for (let x = 0; x < width; x++) {
      raw[row + 1 + x * 3] = rgb[0];
      raw[row + 2 + x * 3] = rgb[1];
      raw[row + 3 + x * 3] = rgb[2];
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('tEXt', Buffer.from('Comment\0scanned at the school office', 'latin1')),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

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

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

test('preparation: requirements, states, a sealed scan, the confirmation, the audited reveal', async ({
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
  const me = await call(page, 'GET', '/v1/me');
  const myEmail = me.json.email as string;

  await page.goto('/preparation');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Preparation');
  await expect(page.getByText('Live', { exact: true })).toBeVisible();
  await expect(page.getByText('No requirements yet', { exact: false })).toBeVisible();

  // The packing checklist (slice 048): two items; Minji ticks the passport from her phone.
  await expect(page.getByTestId('packing-ready')).toHaveText('0 of 3 travelers fully packed');
  const packingForm = page.getByRole('form', { name: 'Add an item' });
  await packingForm.getByLabel('Item').fill('Passport + copy');
  await packingForm.getByRole('button', { name: 'Add' }).click();
  await expect(page.getByTestId('packing').locator('li')).toHaveCount(1);
  await packingForm.getByLabel('Item').fill('EU plug adapter');
  await packingForm.getByLabel('Note').fill('Type C or F');
  await packingForm.getByRole('button', { name: 'Add' }).click();
  const adapterRow = page
    .getByTestId('packing')
    .locator('li')
    .filter({ hasText: 'EU plug adapter' });
  await expect(adapterRow).toContainText('Type C or F');
  await expect(adapterRow).toContainText('0 of 3 packed');
  const issued = await call(page, 'POST', `${base}/invites`);
  const minjiCode = (issued.json.invites as { displayName: string; code: string }[]).find(
    (i) => i.displayName === 'Minji Park',
  )?.code;
  const ctx = await page.context().browser()?.newContext();
  if (!ctx) throw new Error('no browser for the second context');
  const minji = await ctx.newPage();
  await signIn(minji);
  expect((await call(minji, 'POST', '/v1/invites/redeem', { code: minjiCode })).status).toBe(200);
  const mine = await call(minji, 'GET', `${base}/packing/mine`);
  const passportId = (mine.json.items as { id: string; name: string }[]).find(
    (i) => i.name === 'Passport + copy',
  )?.id;
  expect(
    (await call(minji, 'PUT', `${base}/packing/${passportId}/mine`, { packed: true })).status,
  ).toBe(200);
  await ctx.close();
  await page.reload();
  await expect(page.getByText('Live', { exact: true })).toBeVisible();
  const passportRow = page
    .getByTestId('packing')
    .locator('li')
    .filter({ hasText: 'Passport + copy' });
  await expect(passportRow).toContainText('1 of 3 packed');
  await page.getByText('By traveler').click();
  await expect(page.getByTestId('packing-travelers')).toContainText('Minji Park · Bus A · 1/2');
  await page.mouse.move(0, 0);
  await page.screenshot({
    path: `${OUT}/${info.project.name}/preparation-packing.png`,
    fullPage: true,
  });

  // Add a required document with a due date.
  const form = page.getByRole('form', { name: 'Add a requirement' });
  await form.getByLabel('Document').fill('Passport copy');
  await form.getByLabel('Due date').fill('2026-12-10');
  await form.getByRole('button', { name: 'Add' }).click();
  const row = page
    .getByTestId('doc-table')
    .locator('tbody tr')
    .filter({ hasText: 'Passport copy' });
  await expect(row).toContainText('Required');
  await expect(row).toContainText('0/3');
  await expect(row).toContainText('2026-12-10');
  await expect(page.locator('.page__subtitle')).toHaveText(
    '3 required documents still missing across 3 travelers',
  );

  // Open it: three travelers; Minji collected by hand; Juho gets a scan.
  await page.getByRole('button', { name: 'Open Passport copy' }).click();
  const items = page.getByTestId('doc-items');
  await expect(items.locator('tbody tr')).toHaveCount(3);
  await page.getByLabel('State of Minji Park').selectOption('collected');
  await expect(row).toContainText('1/3');
  const juho = items.locator('tbody tr').filter({ hasText: 'Juho Kim' });
  await expect(juho).toContainText('No scan');
  await page.getByRole('button', { name: 'Upload a scan for Juho Kim' }).click();
  await page.getByTestId('scan-input').setInputFiles({
    name: 'juho-passport.png',
    mimeType: 'image/png',
    buffer: png(480, 320, [240, 200, 90]),
  });
  await expect(juho).toContainText('Image on file · uploaded by Owner');
  await expect(row).toContainText('2/3');
  await expect(page.locator('.page__subtitle')).toHaveText(
    '1 required documents still missing across 3 travelers',
  );

  // Slice 060: one nudge to the traveler still missing it (and any guardian of hers).
  await page.getByRole('button', { name: 'Remind about Passport copy' }).click();
  await expect(page.getByTestId('remind-status')).toContainText('Reminded');
  await page.getByRole('button', { name: 'Remind about Passport copy' }).click();
  await expect(page.getByTestId('remind-status')).toContainText('already reminded today');

  // Reveal: the first try asks for a confirmation and emails the link.
  await page.getByRole('button', { name: 'Reveal the scan of Juho Kim' }).click();
  await expect(page.getByTestId('items-status')).toContainText('confirm it is you');
  await expect(page.getByTestId('scan-viewer')).toHaveCount(0);
  const res = await page.request.get(`/v1/dev/mailbox?to=${encodeURIComponent(myEmail)}`);
  expect(res.ok()).toBeTruthy();
  const mail = (await res.json()) as { text: string };
  const link = /https?:\/\/\S+\/auth\/reauth#token=[A-Za-z0-9_-]+/.exec(mail.text)?.[0];
  if (!link) throw new Error('confirmation link not found in the mail body');
  await page.goto(link);
  await page.waitForURL(/\/preparation$/);
  await expect(page.getByText('Live', { exact: true })).toBeVisible();

  // Confirmed: the second reveal shows the scan under the watermark; the count reads 1.
  await page.getByRole('button', { name: 'Open Passport copy' }).click();
  await page.getByRole('button', { name: 'Reveal the scan of Juho Kim' }).click();
  const viewer = page.getByTestId('scan-viewer');
  await expect(viewer).toBeVisible();
  await expect(viewer).toContainText('Passport copy of Juho Kim');
  await expect(page.getByTestId('scan-watermark')).toContainText(`Revealed to ${myEmail}`);
  const img = viewer.locator('img');
  await expect(img).toBeVisible();
  expect(await img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBe(480);
  await expect(items.locator('tbody tr').filter({ hasText: 'Juho Kim' })).toContainText(
    '1 reveal so far',
  );

  await page.mouse.move(0, 0);
  await page.screenshot({
    path: `${OUT}/${info.project.name}/preparation-live.png`,
    fullPage: true,
  });

  // The Reports tile reads the completion (2 of 3 required items done).
  await page.goto('/reports');
  await expect(page.getByText('Live', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Required documents')).toBeVisible();
  await expect(page.getByText('67%')).toBeVisible();
});
