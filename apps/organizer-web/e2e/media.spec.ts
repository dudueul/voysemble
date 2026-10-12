// Copyright 2026- At Day. All rights reserved.
// Browser facts for slice 043 (D18): the organizer uploads two photos from the console (one with
// the fixture's moderation marker); the clean one lands in the pool with a thumbnail made in the
// browser, the marked one waits in the review queue; Approve moves it to the pool; Add to album
// tagged with Minji raises the album counts; the thumbnails decode; Delete removes one. Capture
// media-live.png.

import { deflateSync } from 'node:zlib';
import { expect, type Page, test } from '@playwright/test';
import { OUT, signInWithOrg } from './helpers';

const CSV =
  'name,group,guardian_name,guardian_contact\nMinji Park,Bus A,Sora Park,sora@example.com\nJuho Kim,Bus B,,';

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

/** A valid solid-color RGB PNG the browser can decode, with an optional text chunk. */
function png(width: number, height: number, rgb: [number, number, number], comment?: string) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  const raw = Buffer.alloc(height * (1 + width * 3));
  for (let y = 0; y < height; y++) {
    const row = y * (1 + width * 3);
    raw[row] = 0;
    for (let x = 0; x < width; x++) {
      raw[row + 1 + x * 3] = rgb[0];
      raw[row + 2 + x * 3] = rgb[1];
      raw[row + 3 + x * 3] = rgb[2];
    }
  }
  const parts = [
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    ...(comment ? [chunk('tEXt', Buffer.from(`Comment\0${comment}`, 'latin1'))] : []),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ];
  return Buffer.concat(parts);
}

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

test('media: upload, moderation queue, approve, album tags, delete', async ({ page }, info) => {
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

  await page.goto('/media');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Media');
  await expect(page.getByText('Live', { exact: true })).toBeVisible();
  await expect(page.getByText('No photos yet', { exact: false })).toBeVisible();

  // Two uploads: a clean 640x480 and a marked one the fixture moderation flags.
  await page.getByTestId('photo-input').setInputFiles([
    { name: 'bus-a.png', mimeType: 'image/png', buffer: png(640, 480, [52, 120, 246]) },
    {
      name: 'backstage.png',
      mimeType: 'image/png',
      buffer: png(320, 240, [220, 80, 60], 'voysemble-flag:nudity'),
    },
  ]);
  await expect(page.getByTestId('media-status')).toHaveText('2 photos uploaded.');
  await expect(page.locator('.page__subtitle')).toHaveText(
    '2 photos · 0 in the guardian album · 1 awaiting review',
  );
  const pool = page.getByTestId('media-pool').getByRole('figure');
  await expect(pool).toHaveCount(1);
  await expect(page.getByTestId('media-flagged')).toContainText('Possible nudity');
  await expect(page.getByTestId('media-flagged')).toContainText('Owner');
  // The thumbnail made in the browser decodes and is small.
  const thumb = page.getByTestId('media-pool').locator('img').first();
  await expect(thumb).toBeVisible();
  expect(await thumb.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(320);
  // (A solid-colour test PNG compresses below the browser's thumbnail, so sizes are not compared.)
  const list = await call(page, 'GET', `${base}/media`);
  const photos = list.json.photos as { status: string; thumbnailBytes: number; bytes: number }[];
  expect(photos.map((p) => p.status).sort()).toEqual(['flagged', 'pool']);
  expect(photos.every((p) => p.thumbnailBytes > 0 && p.bytes > 0)).toBeTruthy();

  // Approve the flagged one.
  await page.getByRole('button', { name: 'Approve the photo by Owner' }).click();
  await expect(page.getByTestId('media-flagged')).toHaveCount(0);
  await expect(pool).toHaveCount(2);
  await expect(page.getByText('Nothing waiting for review.')).toBeVisible();

  // Tag the first pool photo with Minji; the album counts follow and the row names her.
  await page.getByRole('button', { name: 'Add the photo by Owner to the album' }).first().click();
  const panel = page.getByRole('form', { name: 'Album tags for the photo by Owner' });
  await expect(panel.getByRole('button', { name: 'Save to album' })).toBeDisabled();
  await panel.getByLabel('Minji Park').check();
  await panel.getByRole('button', { name: 'Save to album' }).click();
  await expect(page.getByTestId('media-album-counts')).toContainText('1 approved photos');
  await expect(page.getByTestId('media-album')).toContainText('Minji Park');
  await expect(page.getByTestId('media-album')).toContainText('approved by Owner');
  await expect(page.getByTestId('photo-approved')).toHaveCount(1);
  await expect(page.locator('.page__subtitle')).toHaveText(
    '2 photos · 1 in the guardian album · 0 awaiting review',
  );

  await page.mouse.move(0, 0);
  await page.screenshot({ path: `${OUT}/${info.project.name}/media-live.png`, fullPage: true });

  // Delete the other one.
  await page
    .getByTestId('photo-pool')
    .getByRole('button', { name: 'Delete the photo by Owner' })
    .click();
  await expect(pool).toHaveCount(1);
  await expect(page.locator('.page__subtitle')).toHaveText(
    '1 photos · 1 in the guardian album · 0 awaiting review',
  );
});
