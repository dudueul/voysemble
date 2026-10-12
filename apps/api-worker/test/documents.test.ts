// Copyright 2026- At Day. All rights reserved.
// Facts (D27, D35, D36, slice 045): the organizer adds requirements and the list counts every
// traveler as missing; states move a row and the counts follow; a PDF scan is stored sealed and
// marks the row collected, a PNG scan loses its text chunk; revealing without a confirmation is
// 403 REAUTH_REQUIRED; the reauth link arrives by mail, a sign-in link cannot confirm and a reauth
// link cannot sign in, another session's link is refused; once confirmed the bytes come back
// with no-store and the reveal is on the traveler's timeline; the report carries the documents
// tile; deleting a scan and a requirement shreds the objects; leaders, travelers, guardians and
// strangers are 403; a bad file, an oversize file and an unknown traveler are refused.

import { env, SELF } from 'cloudflare:test';
import type {
  DocumentItem,
  DocumentItemList,
  DocumentRequirement,
  DocumentRequirementList,
  PersonTimeline,
  TripReport,
} from '@voysemble/contracts';
import { describe, expect, it } from 'vitest';
import { FixtureEmailPort } from '../src/email/EmailPort';
import { api, type Client, createOrg, createTrip, json, SAMPLE_CSV, signIn } from './helpers';

const text = (s: string) => Uint8Array.from(s, (ch) => ch.charCodeAt(0));
const u32be = (n: number) => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
function cat(...parts: (Uint8Array | number[])[]): Uint8Array {
  const arrays = parts.map((p) => (p instanceof Uint8Array ? p : Uint8Array.from(p)));
  const out = new Uint8Array(arrays.reduce((n, a) => n + a.length, 0));
  let o = 0;
  for (const a of arrays) {
    out.set(a, o);
    o += a.length;
  }
  return out;
}
const chunk = (type: string, data: Uint8Array) =>
  cat(u32be(data.length), text(type), data, [0, 0, 0, 0]);
const PNG = cat(
  [0x89],
  text('PNG'),
  [0x0d, 0x0a, 0x1a, 0x0a],
  chunk('IHDR', cat(u32be(1), u32be(1), [8, 2, 0, 0, 0])),
  chunk('tEXt', text('Comment\0scanned at home')),
  chunk('IDAT', cat([0x78, 0x9c, 0x63, 0x60, 0x60, 0x60, 0, 0, 0, 4, 0, 1])),
  chunk('IEND', new Uint8Array(0)),
);
const PDF = text('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n%%EOF\n');

async function uploadScan(client: Client, path: string, bytes: Uint8Array, name = 'scan.pdf') {
  const form = new FormData();
  form.append('file', new Blob([bytes as unknown as ArrayBuffer]), name);
  return SELF.fetch(`https://example.com${path}/scan`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${client.token}` },
    body: form,
  });
}

async function reveal(client: Client, path: string) {
  return SELF.fetch(`https://example.com${path}/scan/reveal`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${client.token}` },
  });
}

async function mailToken(email: string, pattern: RegExp): Promise<string> {
  if (!env.DEV_MAILBOX) throw new Error('DEV_MAILBOX missing');
  const mail = await FixtureEmailPort.latest(env.DEV_MAILBOX, email);
  const token = pattern.exec(mail?.text ?? '')?.[1];
  if (!token) throw new Error(`no token in mail: ${mail?.text}`);
  return token;
}

async function confirm(client: Client): Promise<void> {
  expect((await api(client).post('/v1/auth/reauth')).status).toBe(202);
  const token = await mailToken(client.email, /\/auth\/reauth#token=([A-Za-z0-9_-]+)/);
  const r = await api(client).post('/v1/auth/reauth/verify', { token });
  expect(r.status).toBe(200);
}

async function setupTrip() {
  const nate = await signIn('nate@example.com');
  const org = await createOrg(nate);
  const trip = await createTrip(nate, org.id);
  const base = `/v1/orgs/${org.id}/trips/${trip.id}`;
  await api(nate).post(`${base}/roster/import`, { csv: SAMPLE_CSV });
  await api(nate).post(`${base}/roster/leaders`, { displayName: 'Kim', groupName: 'Bus A' });
  const issued = await json<{
    invites: { displayName: string; code: string; participationId: string }[];
  }>(await api(nate).post(`${base}/invites`));
  const invite = (name: string) => issued.invites.find((i) => i.displayName === name);
  const redeem = async (email: string, name: string) => {
    const c = await signIn(email);
    expect((await api(c).post('/v1/invites/redeem', { code: invite(name)?.code })).status).toBe(
      200,
    );
    return c;
  };
  return {
    nate,
    org,
    trip,
    base,
    kim: await redeem('kim@example.com', 'Kim'),
    minji: await redeem('minji@example.com', 'Minji Park'),
    sora: await redeem('sora@example.com', 'Sora Park'),
    minjiId: invite('Minji Park')?.participationId ?? '',
    juhoId: invite('Juho Kim')?.participationId ?? '',
  };
}

describe('documents and forms (slice 045)', () => {
  it('requirements, states, scans, the reauth gate, the audited reveal, the report, deletion', async () => {
    const t = await setupTrip();
    const docs = `${t.base}/documents`;

    // Two requirements; three travelers on the roster count as missing.
    const passport = await json<DocumentRequirement>(
      await api(t.nate).post(docs, { name: 'Passport copy', required: true, dueOn: '2026-12-10' }),
    );
    expect(passport).toMatchObject({
      name: 'Passport copy',
      required: true,
      dueOn: '2026-12-10',
      counts: { travelers: 3, collected: 0, waived: 0, missing: 3, scans: 0 },
    });
    const packing = await json<DocumentRequirement>(
      await api(t.nate).post(docs, { name: 'Packing list', required: false }),
    );
    expect(packing).toMatchObject({ required: false, dueOn: null });
    let list = await json<DocumentRequirementList>(await api(t.nate).get(docs));
    expect(list.travelers).toBe(3);
    expect(list.missingRequired).toBe(3);
    expect(list.requirements.map((r) => r.name)).toEqual(['Passport copy', 'Packing list']);
    expect((await api(t.nate).post(docs, { name: '' })).status).toBe(400);
    expect((await api(t.nate).post(docs, { name: 'x', dueOn: 'tomorrow' })).status).toBe(400);

    // Items: every traveler, missing; Minji collected, Hana waived; the counts follow.
    const items = `${docs}/${passport.id}/items`;
    const before = await json<DocumentItemList>(await api(t.nate).get(items));
    expect(before.items.map((i) => [i.displayName, i.state])).toEqual([
      ['Juho Kim', 'missing'],
      ['Minji Park', 'missing'],
      ['Lee, Hana', 'missing'],
    ]);
    const minji = await json<DocumentItem>(
      await api(t.nate).put(`${items}/${t.minjiId}`, { state: 'collected' }),
    );
    expect(minji).toMatchObject({
      state: 'collected',
      updatedByName: 'Owner',
      scan: null,
      reveals: 0,
    });
    const hanaId = before.items[2]?.participationId ?? '';
    expect((await api(t.nate).put(`${items}/${hanaId}`, { state: 'waived' })).status).toBe(200);
    list = await json<DocumentRequirementList>(await api(t.nate).get(docs));
    expect(list.requirements[0]?.counts).toEqual({
      travelers: 3,
      collected: 1,
      waived: 1,
      missing: 1,
      scans: 0,
    });
    expect(list.missingRequired).toBe(1);
    expect(
      (await api(t.nate).put(`${items}/${crypto.randomUUID()}`, { state: 'collected' })).status,
    ).toBe(404);
    expect((await api(t.nate).put(`${items}/${t.minjiId}`, { state: 'lost' })).status).toBe(400);

    // A PDF scan for Juho marks the row collected; the object at rest is sealed.
    const juho = `${items}/${t.juhoId}`;
    const up = await uploadScan(t.nate, juho, PDF);
    expect(up.status, await up.clone().text()).toBe(201);
    const juhoItem = await json<DocumentItem>(up);
    expect(juhoItem).toMatchObject({
      state: 'collected',
      scan: { contentType: 'application/pdf', bytes: PDF.length, uploadedByName: 'Owner' },
    });
    const stored = await env.MEDIA.get(
      `documents/${t.org.id}/${t.trip.id}/${passport.id}/${t.juhoId}`,
    );
    const raw = new Uint8Array((await stored?.arrayBuffer()) ?? new ArrayBuffer(0));
    expect(raw.length).toBeGreaterThan(PDF.length);
    expect(Array.from(raw.subarray(0, 5))).not.toEqual(Array.from(PDF.subarray(0, 5)));
    list = await json<DocumentRequirementList>(await api(t.nate).get(docs));
    expect(list.requirements[0]?.counts).toMatchObject({ collected: 2, missing: 0, scans: 1 });

    // Bad files.
    expect((await uploadScan(t.nate, juho, text('GIF89a nope'), 'x.gif')).status).toBe(400);
    expect((await uploadScan(t.nate, juho, new Uint8Array(13 * 1024 * 1024))).status).toBe(400);
    expect((await uploadScan(t.nate, `${items}/${crypto.randomUUID()}`, PDF)).status).toBe(404);

    // Reveal: refused until confirmed; the code tells the console what to do.
    const gated = await reveal(t.nate, juho);
    expect(gated.status).toBe(403);
    expect((await json<{ error: { code: string } }>(gated)).error.code).toBe('REAUTH_REQUIRED');
    // A sign-in link cannot confirm; a reauth link cannot sign in; Kim's reauth link is not Nate's.
    expect(
      (await api(t.nate).post('/v1/auth/magic-link', { email: 'nate@example.com', locale: 'en' }))
        .status,
    ).toBe(202);
    const signInToken = await mailToken('nate@example.com', /#token=([A-Za-z0-9_-]+)/);
    expect((await api(t.nate).post('/v1/auth/reauth/verify', { token: signInToken })).status).toBe(
      404,
    );
    expect((await api(t.kim).post('/v1/auth/reauth')).status).toBe(202);
    const kimToken = await mailToken('kim@example.com', /\/auth\/reauth#token=([A-Za-z0-9_-]+)/);
    expect((await api(t.nate).post('/v1/auth/reauth/verify', { token: kimToken })).status).toBe(
      404,
    );
    const signIn2 = await SELF.fetch('https://example.com/v1/auth/magic-link/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: kimToken, client: 'native' }),
    });
    expect(signIn2.status).toBe(401);
    expect((await api(null).post('/v1/auth/reauth')).status).toBe(401);
    // Nate confirms; the link works once; the bytes come back; the reveal is audited.
    await confirm(t.nate);
    const nateToken = await mailToken('nate@example.com', /\/auth\/reauth#token=([A-Za-z0-9_-]+)/);
    expect((await api(t.nate).post('/v1/auth/reauth/verify', { token: nateToken })).status).toBe(
      404,
    );
    const bytes = await reveal(t.nate, juho);
    expect(bytes.status).toBe(200);
    expect(bytes.headers.get('content-type')).toBe('application/pdf');
    expect(bytes.headers.get('cache-control')).toBe('no-store');
    expect(new Uint8Array(await bytes.arrayBuffer())).toEqual(PDF);
    const afterReveal = await json<DocumentItemList>(await api(t.nate).get(items));
    expect(afterReveal.items.find((i) => i.participationId === t.juhoId)?.reveals).toBe(1);
    const timeline = await json<PersonTimeline>(
      await api(t.nate).get(`${t.base}/people/${t.juhoId}/timeline`),
    );
    expect(
      timeline.entries.filter((e) => e.kind === 'document_reveal').map((e) => [e.title, e.detail]),
    ).toEqual([['Document scan revealed by Owner', 'Passport copy']]);
    expect((await reveal(t.nate, `${items}/${t.minjiId}`)).status).toBe(404);

    // A PNG scan replaces the PDF and loses its text chunk.
    expect((await uploadScan(t.nate, juho, PNG, 'scan.png')).status).toBe(201);
    const png = await reveal(t.nate, juho);
    expect(png.headers.get('content-type')).toBe('image/png');
    const pngBytes = new Uint8Array(await png.arrayBuffer());
    expect(pngBytes.length).toBeLessThan(PNG.length);
    expect(Array.from(pngBytes).join(',')).not.toContain(Array.from(text('scanned')).join(','));

    // The report carries the documents tile.
    const report = await json<TripReport>(await api(t.nate).get(`${t.base}/report`));
    expect(report.documents).toEqual({
      requirements: 2,
      required: 1,
      travelers: 3,
      requiredItems: 3,
      requiredDone: 3,
      missingRequired: 0,
      completionPct: 100,
    });

    // Delete the scan (state stays); delete the requirement (rows and objects gone).
    const cleared = await json<DocumentItem>(await api(t.nate).delete(`${juho}/scan`));
    expect(cleared).toMatchObject({ state: 'collected', scan: null });
    expect(
      await env.MEDIA.get(`documents/${t.org.id}/${t.trip.id}/${passport.id}/${t.juhoId}`),
    ).toBeNull();
    expect((await api(t.nate).delete(`${juho}/scan`)).status).toBe(404);
    expect((await uploadScan(t.nate, juho, PDF)).status).toBe(201);
    expect((await api(t.nate).delete(`${docs}/${passport.id}`)).status).toBe(200);
    expect(
      await env.MEDIA.get(`documents/${t.org.id}/${t.trip.id}/${passport.id}/${t.juhoId}`),
    ).toBeNull();
    expect((await api(t.nate).get(items)).status).toBe(404);
    list = await json<DocumentRequirementList>(await api(t.nate).get(docs));
    expect(list.requirements.map((r) => r.name)).toEqual(['Packing list']);
    const renamed = await json<DocumentRequirement>(
      await api(t.nate).patch(`${docs}/${packing.id}`, {
        name: 'Packing checklist',
        required: true,
        dueOn: '2026-12-20',
      }),
    );
    expect(renamed).toMatchObject({
      name: 'Packing checklist',
      required: true,
      dueOn: '2026-12-20',
    });
    expect((await api(t.nate).patch(`${docs}/${crypto.randomUUID()}`, { name: 'x' })).status).toBe(
      404,
    );
  });

  it('leaders, travelers, guardians and strangers never see documents', async () => {
    const t = await setupTrip();
    const docs = `${t.base}/documents`;
    const req = await json<DocumentRequirement>(await api(t.nate).post(docs, { name: 'Consent' }));
    const item = `${docs}/${req.id}/items/${t.minjiId}`;
    for (const who of [t.kim, t.minji, t.sora, await signIn('stranger@example.com')]) {
      expect((await api(who).get(docs)).status).toBe(403);
      expect((await api(who).post(docs, { name: 'x' })).status).toBe(403);
      expect((await api(who).get(`${docs}/${req.id}/items`)).status).toBe(403);
      expect((await api(who).put(item, { state: 'collected' })).status).toBe(403);
      expect((await uploadScan(who, item, PDF)).status).toBe(403);
      expect((await reveal(who, item)).status).toBe(403);
    }
    expect((await api(null).get(docs)).status).toBe(401);
    expect(
      (await api(t.nate).get(`/v1/orgs/${t.org.id}/trips/${crypto.randomUUID()}/documents`)).status,
    ).toBe(404);
  });
});
