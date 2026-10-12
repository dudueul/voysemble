// Copyright 2026- At Day. All rights reserved.
// Facts (D38, slice 048): the list starts empty over the roster's travelers; the organizer adds
// items and every traveler reads them unpacked; a traveler ticks their own item and the counts
// follow; a guardian reads and ticks for the traveler they are bound to; a leader packs for
// themselves without touching the travelers' counts; a leader reads the progress but cannot add;
// travelers, guardians and strangers cannot read the progress; an organizer without a
// participation has no list of their own; renaming and deleting an item; unknown item and trip.

import type { MyPackingItem, MyPackingList, PackingItem, PackingList } from '@voysemble/contracts';
import { describe, expect, it } from 'vitest';
import { api, createOrg, createTrip, json, SAMPLE_CSV, signIn } from './helpers';

async function setupTrip() {
  const nate = await signIn('nate@example.com');
  const org = await createOrg(nate);
  const trip = await createTrip(nate, org.id);
  const base = `/v1/orgs/${org.id}/trips/${trip.id}`;
  await api(nate).post(`${base}/roster/import`, { csv: SAMPLE_CSV });
  await api(nate).post(`${base}/roster/leaders`, { displayName: 'Kim', groupName: 'Bus A' });
  const issued = await json<{ invites: { displayName: string; code: string }[] }>(
    await api(nate).post(`${base}/invites`),
  );
  const redeem = async (email: string, name: string) => {
    const c = await signIn(email);
    const code = issued.invites.find((i) => i.displayName === name)?.code;
    expect((await api(c).post('/v1/invites/redeem', { code })).status).toBe(200);
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
  };
}

describe('packing checklist (slice 048)', () => {
  it('items, ticks by the traveler and the guardian, progress for staff, roles, edits', async () => {
    const t = await setupTrip();
    const packing = `${t.base}/packing`;

    // Empty over the roster's three travelers.
    const empty = await json<PackingList>(await api(t.nate).get(packing));
    expect(empty.items).toEqual([]);
    expect(empty.travelers.map((p) => p.displayName)).toEqual([
      'Juho Kim',
      'Minji Park',
      'Lee, Hana',
    ]);
    expect(empty.ready).toBe(0);

    // Two items; every traveler reads them unpacked.
    const passport = await json<PackingItem>(
      await api(t.nate).post(packing, { name: 'Passport + copy' }),
    );
    const adapter = await json<PackingItem>(
      await api(t.nate).post(packing, { name: 'EU plug adapter', note: 'Type C or F' }),
    );
    expect(passport.counts).toEqual({ travelers: 3, packed: 0 });
    expect(adapter.note).toBe('Type C or F');
    const minjiList = await json<MyPackingList>(await api(t.minji).get(`${packing}/mine`));
    expect(minjiList.packingFor).toBe('self');
    expect(minjiList.travelerName).toBe('Minji Park');
    expect(minjiList.items.map((i) => [i.name, i.packed])).toEqual([
      ['Passport + copy', false],
      ['EU plug adapter', false],
    ]);
    expect([minjiList.packed, minjiList.total]).toEqual([0, 2]);

    // Minji ticks the passport: her list and the organizer's counts follow.
    const ticked = await json<MyPackingItem>(
      await api(t.minji).put(`${packing}/${passport.id}/mine`, { packed: true }),
    );
    expect(ticked.packed).toBe(true);
    expect(ticked.packedAt).not.toBeNull();
    let list = await json<PackingList>(await api(t.nate).get(packing));
    expect(list.items.map((i) => i.counts.packed)).toEqual([1, 0]);
    const minjiProgress = list.travelers.find((p) => p.displayName === 'Minji Park');
    expect([minjiProgress?.packed, minjiProgress?.total]).toEqual([1, 2]);
    expect(list.ready).toBe(0);

    // Sora, Minji's guardian, reads Minji's list and ticks the adapter for her.
    const soraList = await json<MyPackingList>(await api(t.sora).get(`${packing}/mine`));
    expect(soraList.packingFor).toBe('guardian');
    expect(soraList.travelerName).toBe('Minji Park');
    expect(soraList.packed).toBe(1);
    expect((await api(t.sora).put(`${packing}/${adapter.id}/mine`, { packed: true })).status).toBe(
      200,
    );
    list = await json<PackingList>(await api(t.nate).get(packing));
    expect(list.ready).toBe(1);
    expect(list.items.map((i) => i.counts.packed)).toEqual([1, 1]);

    // Kim, a leader, packs for himself: his own list, not counted among the travelers.
    const kimList = await json<MyPackingList>(await api(t.kim).get(`${packing}/mine`));
    expect(kimList.packingFor).toBe('self');
    expect(kimList.travelerName).toBe('Kim');
    expect((await api(t.kim).put(`${packing}/${passport.id}/mine`, { packed: true })).status).toBe(
      200,
    );
    list = await json<PackingList>(await api(t.kim).get(packing));
    expect(list.items.map((i) => i.counts.packed)).toEqual([1, 1]);

    // Unticking takes the tick back.
    const unticked = await json<MyPackingItem>(
      await api(t.minji).put(`${packing}/${passport.id}/mine`, { packed: false }),
    );
    expect([unticked.packed, unticked.packedAt]).toEqual([false, null]);
    list = await json<PackingList>(await api(t.nate).get(packing));
    expect(list.items.map((i) => i.counts.packed)).toEqual([0, 1]);
    expect(list.ready).toBe(0);

    // Roles: a leader reads but cannot add; a traveler, a guardian and a stranger cannot read the
    // progress; the organizer has no list of their own; anonymous is 401.
    expect((await api(t.kim).post(packing, { name: 'Umbrella' })).status).toBe(403);
    expect((await api(t.minji).get(packing)).status).toBe(403);
    expect((await api(t.sora).get(packing)).status).toBe(403);
    expect((await api(t.nate).get(`${packing}/mine`)).status).toBe(403);
    const stranger = await signIn('stranger@example.com');
    expect((await api(stranger).get(packing)).status).toBe(403);
    expect((await api(stranger).get(`${packing}/mine`)).status).toBe(403);
    expect((await api(null).get(packing)).status).toBe(401);

    // Edits: rename, a blank name is 400, delete takes the ticks with it, unknown item and trip.
    const renamed = await json<PackingItem>(
      await api(t.nate).patch(`${packing}/${passport.id}`, { name: 'Passport and a copy' }),
    );
    expect(renamed.name).toBe('Passport and a copy');
    expect((await api(t.nate).post(packing, { name: '   ' })).status).toBe(400);
    expect((await api(t.nate).delete(`${packing}/${adapter.id}`)).status).toBe(200);
    const after = await json<MyPackingList>(await api(t.minji).get(`${packing}/mine`));
    expect(after.items.map((i) => i.name)).toEqual(['Passport and a copy']);
    expect([after.packed, after.total]).toEqual([0, 1]);
    expect((await api(t.nate).delete(`${packing}/${adapter.id}`)).status).toBe(404);
    expect(
      (await api(t.minji).put(`${packing}/${crypto.randomUUID()}/mine`, { packed: true })).status,
    ).toBe(404);
    expect(
      (await api(t.nate).get(`/v1/orgs/${t.org.id}/trips/${crypto.randomUUID()}/packing`)).status,
    ).toBe(404);
  });
});
