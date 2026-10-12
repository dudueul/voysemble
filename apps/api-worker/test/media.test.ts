// Copyright 2026- At Day. All rights reserved.
// Facts (D18, slice 043): a traveler uploads a PNG (the type from the bytes, the metadata chunks
// gone, the day from the trip zone); the pool lists it for leaders, travelers and organizers,
// never for guardians; the bytes come back unsealed only to those; a marked upload is flagged,
// hidden from other travelers but not its uploader, cleared by a leader into the pool; a leader
// puts a photo in the album tagged with Minji or the whole group and her guardian then sees it,
// another guardian only the group one; the tag lands on Minji's timeline; a flagged photo cannot
// enter the album; a guardian, a bad type and an oversize upload are refused; the uploader and the
// organizer delete, a stranger traveler cannot, and the objects are gone.

import { env, SELF } from 'cloudflare:test';
import type { PersonTimeline, Photo, PhotoList } from '@voysemble/contracts';
import { describe, expect, it } from 'vitest';
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
const PNG_SIG = cat([0x89], text('PNG'), [0x0d, 0x0a, 0x1a, 0x0a]);

/** A tiny PNG with an optional text chunk (where the fixture moderation marker travels). */
function png(comment?: string, padBytes = 0): Uint8Array {
  const ihdr = chunk('IHDR', cat(u32be(1), u32be(1), [8, 2, 0, 0, 0]));
  const idat = chunk('IDAT', cat([0x78, 0x9c, 0x63, 0x60, 0x60, 0x60, 0, 0, 0, 4, 0, 1]));
  const txt = comment ? chunk('tEXt', text(`Comment\0${comment}`)) : new Uint8Array(0);
  const pad = padBytes ? chunk('IDAT', new Uint8Array(padBytes)) : new Uint8Array(0);
  return cat(PNG_SIG, ihdr, txt, idat, pad, chunk('IEND', new Uint8Array(0)));
}

async function upload(
  client: Client,
  base: string,
  original: Uint8Array,
  extra: { thumbnail?: Uint8Array; takenAt?: string; type?: string } = {},
) {
  const form = new FormData();
  form.append(
    'original',
    new Blob([original as unknown as ArrayBuffer], { type: extra.type ?? 'image/png' }),
    'p.png',
  );
  if (extra.thumbnail) {
    form.append(
      'thumbnail',
      new Blob([extra.thumbnail as unknown as ArrayBuffer], { type: 'image/png' }),
      't.png',
    );
  }
  if (extra.takenAt) form.append('takenAt', extra.takenAt);
  return SELF.fetch(`https://example.com${base}/media`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${client.token}` },
    body: form,
  });
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
    juho: await redeem('juho@example.com', 'Juho Kim'),
    sora: await redeem('sora@example.com', 'Sora Park'),
    hanaMom: await redeem('hm@example.com', 'Hana Mom'),
    minjiId: invite('Minji Park')?.participationId ?? '',
  };
}

describe('photos (slice 043)', () => {
  it('upload, pool visibility, bytes, moderation flag and review, album and guardian view, delete', async () => {
    const t = await setupTrip();

    // Minji uploads a clean photo on the concert day; the stored bytes lost the text chunk.
    const res = await upload(t.minji, t.base, png('Comment with GPS 37.5665,126.9780'), {
      takenAt: '2026-12-29T09:30:00+09:00',
    });
    const resBody = await res.text();
    expect(res.status, resBody).toBe(201);
    const photo = JSON.parse(resBody) as Photo;
    expect(photo).toMatchObject({
      uploaderName: 'Minji Park',
      uploaderRole: 'traveler',
      mine: true,
      day: 4,
      contentType: 'image/png',
      status: 'pool',
      flag: null,
      album: null,
    });
    expect(photo.bytes).toBe(png().length);
    expect(photo.thumbnailBytes).toBe(png().length);
    const bytes = await SELF.fetch(`https://example.com${photo.contentUrl}`, {
      headers: { Authorization: `Bearer ${t.kim.token}` },
    });
    expect(bytes.status).toBe(200);
    expect(bytes.headers.get('content-type')).toBe('image/png');
    expect(new Uint8Array(await bytes.arrayBuffer())).toEqual(png());
    // The object at rest is sealed: not the PNG signature.
    const stored = await env.MEDIA.get(`media/${t.org.id}/${t.trip.id}/${photo.id}/o`);
    const raw = new Uint8Array((await stored?.arrayBuffer()) ?? new ArrayBuffer(0));
    expect(raw.length).toBeGreaterThan(png().length);
    expect(Array.from(raw.subarray(0, 4))).not.toEqual([0x89, 0x50, 0x4e, 0x47]);

    // Visibility: leader, another traveler and the organizer see the pool; guardians see nothing yet.
    for (const who of [t.kim, t.juho, t.nate]) {
      const list = await json<PhotoList>(await api(who).get(`${t.base}/media`));
      expect(list.photos.map((p) => p.id)).toEqual([photo.id]);
      expect(list.photos[0]?.mine).toBe(false);
    }
    expect((await json<PhotoList>(await api(t.sora).get(`${t.base}/media`))).photos).toEqual([]);
    expect(
      (
        await SELF.fetch(`https://example.com${photo.thumbnailUrl}`, {
          headers: { Authorization: `Bearer ${t.sora.token}` },
        })
      ).status,
    ).toBe(404);
    expect((await api(null).get(`${t.base}/media`)).status).toBe(401);

    // A marked upload is flagged: hidden from Juho, visible to Kim (queue) and to Minji herself.
    const flaggedRes = await upload(t.minji, t.base, png('voysemble-flag:nudity'));
    expect(flaggedRes.status).toBe(201);
    const flagged = await json<Photo>(flaggedRes);
    expect(flagged).toMatchObject({ status: 'flagged', flag: 'nudity', day: 0 });
    const juhoList = await json<PhotoList>(await api(t.juho).get(`${t.base}/media`));
    expect(juhoList.photos.map((p) => p.id)).toEqual([photo.id]);
    const kimList = await json<PhotoList>(await api(t.kim).get(`${t.base}/media`));
    expect(kimList.photos.map((p) => [p.id, p.status])).toEqual([
      [flagged.id, 'flagged'],
      [photo.id, 'pool'],
    ]);
    expect(kimList.counts).toEqual({ pool: 1, flagged: 1, approved: 0 });
    const minjiList = await json<PhotoList>(await api(t.minji).get(`${t.base}/media`));
    expect(minjiList.photos.map((p) => p.id)).toEqual([flagged.id, photo.id]);
    // Not in the album while flagged; a traveler cannot review; the leader clears it.
    expect(
      (await api(t.kim).put(`${t.base}/media/${flagged.id}/album`, { wholeGroup: true })).status,
    ).toBe(409);
    expect(
      (await api(t.juho).post(`${t.base}/media/${flagged.id}/review`, { decision: 'clear' }))
        .status,
    ).toBe(403);
    const cleared = await json<Photo>(
      await api(t.kim).post(`${t.base}/media/${flagged.id}/review`, { decision: 'clear' }),
    );
    expect(cleared).toMatchObject({ status: 'pool', flag: 'nudity', reviewedByName: 'Kim' });
    expect(
      (await api(t.kim).post(`${t.base}/media/${flagged.id}/review`, { decision: 'clear' })).status,
    ).toBe(409);
    expect(
      (await json<PhotoList>(await api(t.juho).get(`${t.base}/media`))).photos.map((p) => p.id),
    ).toEqual([flagged.id, photo.id]);

    // Album: Kim tags Minji's photo with Minji; the other with the whole group.
    expect((await api(t.kim).put(`${t.base}/media/${photo.id}/album`, {})).status).toBe(400);
    expect(
      (
        await api(t.kim).put(`${t.base}/media/${photo.id}/album`, {
          participationIds: [crypto.randomUUID()],
        })
      ).status,
    ).toBe(400);
    expect(
      (await api(t.juho).put(`${t.base}/media/${photo.id}/album`, { wholeGroup: true })).status,
    ).toBe(403);
    const tagged = await json<Photo>(
      await api(t.kim).put(`${t.base}/media/${photo.id}/album`, {
        participationIds: [t.minjiId],
      }),
    );
    expect(tagged).toMatchObject({
      status: 'approved',
      album: {
        byName: 'Kim',
        wholeGroup: false,
        participationIds: [t.minjiId],
        taggedNames: ['Minji Park'],
      },
    });
    const groupShot = await json<Photo>(
      await api(t.nate).put(`${t.base}/media/${flagged.id}/album`, { wholeGroup: true }),
    );
    expect(groupShot.album).toMatchObject({ byName: 'Owner', wholeGroup: true, taggedNames: [] });
    // Sora (Minji's guardian) sees both; Hana Mom only the group shot; and the bytes follow.
    const soraList = await json<PhotoList>(await api(t.sora).get(`${t.base}/media`));
    expect(soraList.photos.map((p) => p.id)).toEqual([flagged.id, photo.id]);
    expect(soraList.counts).toEqual({ pool: 2, flagged: 0, approved: 2 });
    const hmList = await json<PhotoList>(await api(t.hanaMom).get(`${t.base}/media`));
    expect(hmList.photos.map((p) => p.id)).toEqual([flagged.id]);
    expect(
      (
        await SELF.fetch(`https://example.com${photo.thumbnailUrl}`, {
          headers: { Authorization: `Bearer ${t.sora.token}` },
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await SELF.fetch(`https://example.com${photo.thumbnailUrl}`, {
          headers: { Authorization: `Bearer ${t.hanaMom.token}` },
        })
      ).status,
    ).toBe(404);
    // The tag is a fact on Minji's timeline.
    const timeline = await json<PersonTimeline>(
      await api(t.nate).get(`${t.base}/people/${t.minjiId}/timeline`),
    );
    expect(
      timeline.entries.filter((e) => e.kind === 'photo_tag').map((e) => [e.title, e.ref?.id]),
    ).toEqual([['Tagged in an album photo by Kim', photo.id]]);
    // Out of the album again: Sora loses it.
    expect(
      (await json<Photo>(await api(t.kim).delete(`${t.base}/media/${photo.id}/album`))).status,
    ).toBe('pool');
    expect(
      (await json<PhotoList>(await api(t.sora).get(`${t.base}/media`))).photos.map((p) => p.id),
    ).toEqual([flagged.id]);

    // Delete: Juho cannot delete Minji's photo; Minji deletes her own; the organizer removes the other.
    expect((await api(t.juho).delete(`${t.base}/media/${photo.id}`)).status).toBe(403);
    expect(await json(await api(t.minji).delete(`${t.base}/media/${photo.id}`))).toEqual({
      deleted: true,
      photoId: photo.id,
    });
    expect(await env.MEDIA.get(`media/${t.org.id}/${t.trip.id}/${photo.id}/o`)).toBeNull();
    expect(await env.MEDIA.get(`media/${t.org.id}/${t.trip.id}/${photo.id}/t`)).toBeNull();
    expect((await api(t.kim).get(`${t.base}/media/${photo.id}/content`)).status).toBe(404);
    expect(
      await json(
        await api(t.nate).post(`${t.base}/media/${flagged.id}/review`, { decision: 'remove' }),
      ),
    ).toEqual({ deleted: true, photoId: flagged.id });
    expect((await json<PhotoList>(await api(t.kim).get(`${t.base}/media`))).photos).toEqual([]);
    expect((await api(t.minji).delete(`${t.base}/media/${photo.id}`)).status).toBe(404);
  });

  it('refuses guardians, strangers, wrong bytes, oversize files, and an organizer uploads too', async () => {
    const t = await setupTrip();
    expect((await upload(t.sora, t.base, png())).status).toBe(403);
    const stranger = await signIn('stranger@example.com');
    expect((await upload(stranger, t.base, png())).status).toBe(403);
    expect((await upload(t.minji, t.base, text('GIF89a not a photo'))).status).toBe(400);
    expect((await upload(t.minji, t.base, png(), { thumbnail: text('GIF89a') })).status).toBe(400);
    // Larger than the thumbnail limit without a thumbnail: refused; with one: stored.
    const big = png(undefined, 600 * 1024);
    expect((await upload(t.minji, t.base, big)).status).toBe(400);
    const withThumb = await upload(t.minji, t.base, big, { thumbnail: png() });
    expect(withThumb.status).toBe(201);
    expect((await json<Photo>(withThumb)).thumbnailBytes).toBe(png().length);
    expect((await upload(t.minji, t.base, png(undefined, 13 * 1024 * 1024))).status).toBe(400);
    // The owner's own upload carries the organizer role; the day is 0 outside the trip dates.
    const mine = await json<Photo>(
      await upload(t.nate, t.base, png(), { takenAt: '2026-10-12T10:00:00Z' }),
    );
    expect(mine).toMatchObject({
      uploaderName: 'Owner',
      uploaderRole: 'owner',
      day: 0,
      mine: true,
    });
    expect(
      (await api(t.nate).get(`/v1/orgs/${t.org.id}/trips/${crypto.randomUUID()}/media`)).status,
    ).toBe(404);
  });
});
