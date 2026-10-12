// Copyright 2026- At Day. All rights reserved.
// Facts (D27, D41; slice 058): a hotel's rooming list starts with every leader and traveler
// unassigned (leaders first); the organizer puts people in rooms and takes them out, the counts
// follow; a leader reads it, a traveler cannot, a guardian cannot be assigned, a bus has none; the
// hotel's link is minted for a hotel only, opens the sheet with no session (the stay, the rooms by
// label with their names, the unassigned, the leaders; no contact, no guardian), counts the
// opens, revokes; deleting the hotel takes the rooms and links; removing a person takes their room.

import type {
  CreateHotelLinkResponse,
  HotelLinkList,
  HotelSheet,
  RoomingList,
} from '@voysemble/contracts';
import { describe, expect, it } from 'vitest';
import { localClock, nowIso, plusDays } from '../src/lib/time';
import { api, createOrg, createTrip, json, SAMPLE_CSV, signIn } from './helpers';

describe('rooming lists and the hotel link (slice 058)', () => {
  it('assigns rooms, serves the sheet through the sealed link, cleans up', async () => {
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
    const kim = await redeem('kim@example.com', 'Kim');
    const minji = await redeem('minji@example.com', 'Minji Park');

    const hotel = await json<{ id: string }>(
      await api(nate).post(`${base}/travel`, {
        kind: 'hotel',
        name: 'Hotel de la Ville',
        city: 'Rome',
        checkIn: '2026-12-28',
        checkOut: '2027-01-02',
        rooms: 21,
        confirmation: 'HDLV-2026-1228',
      }),
    );
    const bus = await json<{ id: string }>(
      await api(nate).post(`${base}/travel`, {
        kind: 'bus',
        label: 'Bus A',
        company: 'Roma Coach',
        seats: 24,
        groups: ['Bus A'],
        driverContact: '',
      }),
    );
    const rooming = `${base}/travel/${hotel.id}/rooming`;

    // Empty: leaders first, then the travelers by group and name; nothing assigned.
    const empty = await json<RoomingList>(await api(nate).get(rooming));
    expect(empty.hotel.name).toBe('Hotel de la Ville');
    expect(empty.people.map((p) => [p.displayName, p.role, p.room])).toEqual([
      ['Kim', 'leader', null],
      ['Juho Kim', 'traveler', null],
      ['Minji Park', 'traveler', null],
      ['Lee, Hana', 'traveler', null],
    ]);
    expect([empty.assigned, empty.roomsUsed]).toEqual([0, 0]);
    expect((await api(nate).get(`${base}/travel/${bus.id}/rooming`)).status).toBe(404);

    // Rooms: Minji and Juho in 204, Kim in 301; the counts follow; a move and a removal.
    const ids = new Map(empty.people.map((p) => [p.displayName, p.participationId]));
    const put = (name: string, room: string | null) =>
      api(nate).put(rooming, { participationId: ids.get(name), room });
    expect((await put('Minji Park', '204')).status).toBe(200);
    expect((await put('Juho Kim', '204')).status).toBe(200);
    const after = await json<RoomingList>(await put('Kim', '301'));
    expect([after.assigned, after.roomsUsed]).toEqual([3, 2]);
    expect(after.people.find((p) => p.displayName === 'Kim')?.room).toBe('301');
    const moved = await json<RoomingList>(await put('Juho Kim', '205'));
    expect(moved.roomsUsed).toBe(3);
    const out = await json<RoomingList>(await put('Juho Kim', null));
    expect([out.assigned, out.roomsUsed]).toEqual([2, 2]);
    // A guardian does not sleep at the hotel; an unknown person is 404; a blank room is 400.
    const guardians = await json<{ participations: { id: string; role: string }[] }>(
      await api(nate).get(`${base}/roster`),
    );
    const sora = guardians.participations.find((p) => p.role === 'guardian')?.id;
    expect((await api(nate).put(rooming, { participationId: sora, room: '204' })).status).toBe(400);
    expect(
      (await api(nate).put(rooming, { participationId: crypto.randomUUID(), room: '204' })).status,
    ).toBe(404);
    expect(
      (await api(nate).put(rooming, { participationId: ids.get('Minji Park'), room: '  ' })).status,
    ).toBe(400);
    // A leader reads; a traveler cannot read or write.
    expect((await api(kim).get(rooming)).status).toBe(200);
    expect((await api(minji).get(rooming)).status).toBe(403);
    expect(
      (await api(kim).put(rooming, { participationId: ids.get('Minji Park'), room: '1' })).status,
    ).toBe(403);

    // The hotel's link: a hotel only; the sheet by room, with no session.
    expect((await api(nate).post(`${base}/travel/${bus.id}/hotel-links`)).status).toBe(404);
    const minted = await json<CreateHotelLinkResponse>(
      await api(nate).post(`${base}/travel/${hotel.id}/hotel-links`),
    );
    expect(minted.url).toMatch(new RegExp(`/hotel/${org.id}#token=[A-Za-z0-9_-]{40,}$`));
    const token = minted.url.split('#token=')[1] ?? '';
    const open = await api(null).post(`/v1/hotel/${org.id}`, { token });
    expect(open.status).toBe(200);
    expect(open.headers.get('cache-control')).toBe('no-store');
    const sheet = await json<HotelSheet>(open);
    expect(sheet.hotel).toEqual({
      name: 'Hotel de la Ville',
      city: 'Rome',
      checkIn: '2026-12-28',
      checkOut: '2027-01-02',
      nights: 5,
      rooms: 21,
      confirmation: 'HDLV-2026-1228',
    });
    expect(sheet.rooms).toEqual([
      { room: '204', names: ['Minji Park'] },
      { room: '301', names: ['Kim'] },
    ]);
    expect(sheet.unassigned).toEqual(['Juho Kim', 'Lee, Hana']);
    expect(sheet.leaders).toEqual(['Kim']);
    expect(sheet.people).toBe(4);
    expect(JSON.stringify(sheet)).not.toContain('sora@example.com');
    const links = await json<HotelLinkList>(
      await api(nate).get(`${base}/travel/${hotel.id}/hotel-links`),
    );
    expect(links.links.map((l) => l.opens)).toEqual([1]);
    expect((await api(null).post(`/v1/hotel/${org.id}`, { token: 'x'.repeat(43) })).status).toBe(
      404,
    );
    expect(
      (await api(nate).delete(`${base}/travel/${hotel.id}/hotel-links/${minted.link.id}`)).status,
    ).toBe(200);
    expect((await api(null).post(`/v1/hotel/${org.id}`, { token })).status).toBe(404);

    // A removed person loses their room; a deleted hotel takes its rooms and links.
    const hanaId = ids.get('Lee, Hana');
    expect((await put('Lee, Hana', '302')).status).toBe(200);
    expect((await api(nate).delete(`${base}/roster/${hanaId}`)).status).toBe(200);
    const afterRemove = await json<RoomingList>(await api(nate).get(rooming));
    expect(afterRemove.people.map((p) => p.displayName)).toEqual(['Kim', 'Juho Kim', 'Minji Park']);
    expect((await api(nate).delete(`${base}/travel/${hotel.id}`)).status).toBe(200);
    expect((await api(nate).get(rooming)).status).toBe(404);
  });
});

describe('the room on the roster during the stay (slice 070)', () => {
  it("carries each person's room while a hotel stay covers today, nothing outside it", async () => {
    const nate = await signIn('nate@example.com');
    const org = await createOrg(nate);
    const trip = await createTrip(nate, org.id);
    const base = `/v1/orgs/${org.id}/trips/${trip.id}`;
    await api(nate).post(`${base}/roster/import`, { csv: SAMPLE_CSV });
    const roster = async () =>
      (
        await json<{ participations: { id: string; displayName: string; room?: string }[] }>(
          await api(nate).get(`${base}/roster`),
        )
      ).participations;
    const minjiId = (await roster()).find((p) => p.displayName === 'Minji Park')?.id ?? '';
    // A stay in the past: no room on the roster.
    const past = await json<{ id: string }>(
      await api(nate).post(`${base}/travel`, {
        kind: 'hotel',
        name: 'Old Hotel',
        city: 'Rome',
        checkIn: '2026-01-10',
        checkOut: '2026-01-12',
        rooms: 10,
        confirmation: '',
      }),
    );
    expect(
      (
        await api(nate).put(`${base}/travel/${past.id}/rooming`, {
          participationId: minjiId,
          room: '101',
        })
      ).status,
    ).toBe(200);
    expect((await roster()).every((p) => p.room === undefined)).toBe(true);
    // A stay that covers today in Seoul: the room rides onto the row; the others carry none.
    const today = localClock(nowIso(), 'Asia/Seoul').date;
    const stay = await json<{ id: string }>(
      await api(nate).post(`${base}/travel`, {
        kind: 'hotel',
        name: 'Hotel de la Ville',
        city: 'Rome',
        checkIn: today,
        checkOut: plusDays(today, 2),
        rooms: 21,
        confirmation: 'HDLV',
      }),
    );
    expect(
      (
        await api(nate).put(`${base}/travel/${stay.id}/rooming`, {
          participationId: minjiId,
          room: '412',
        })
      ).status,
    ).toBe(200);
    const rows = await roster();
    expect(rows.find((p) => p.displayName === 'Minji Park')?.room).toBe('412');
    expect(rows.filter((p) => p.room !== undefined)).toHaveLength(1);
  });
});
