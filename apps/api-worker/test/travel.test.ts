// Copyright 2026- At Day. All rights reserved.
// Facts (D37, slice 046): the plan starts empty with the roster's groups; the organizer adds a
// flight, a hotel (nights derived) and a bus whose assigned seats follow the roster groups it
// names; a flight's status changes with a patch; a patch of another kind is 409; a hotel that
// checks out before it checks in is 400; a bus of zero seats and a bad time are 400; a leader
// reads but cannot write; a traveler, a guardian and a stranger are 403; a deleted booking is
// gone and an unknown one is 404. Slice 049 (D39): the organizer mints a driver link to the bus,
// the sheet opens without an account and lists names only (leaders and travelers of the bus's
// groups), each open is counted, a revoked, unknown or bad token is 404, a traveler cannot mint,
// and deleting the bus takes its links.

import { SELF } from 'cloudflare:test';
import type {
  Booking,
  CreateDriverLinkResponse,
  DriverLinkList,
  DriverSheet,
  TravelPlan,
} from '@voysemble/contracts';
import { describe, expect, it } from 'vitest';
import { driverLinkExpiry } from '../src/routes/travel';
import { api, createOrg, createTrip, json, SAMPLE_CSV, signIn } from './helpers';

/** The driver has no account: a plain POST with the token from the URL fragment. */
async function openSheet(orgId: string, token: string) {
  return SELF.fetch(`https://example.com/v1/driver/${orgId}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token }),
  });
}

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

describe('travel bookings (slice 046)', () => {
  it('flights, hotels and buses with seats from the roster; patches, validation, roles, deletion', async () => {
    const t = await setupTrip();
    const travel = `${t.base}/travel`;
    const empty = await json<TravelPlan>(await api(t.nate).get(travel));
    expect(empty).toEqual({
      flights: [],
      hotels: [],
      buses: [],
      groups: ['Bus A', 'Bus B'],
      travelers: 3,
    });

    const flight = await json<Booking>(
      await api(t.nate).post(travel, {
        kind: 'flight',
        code: 'DEMO 901',
        from: 'ICN',
        to: 'FCO',
        departsAt: '2026-12-28T13:30',
        arrivesAt: '2026-12-28T18:55',
        pax: 42,
        pnr: 'VYS8K2',
      }),
    );
    expect(flight).toMatchObject({
      kind: 'flight',
      code: 'DEMO 901',
      status: 'scheduled',
      pax: 42,
    });
    const hotel = await json<Booking>(
      await api(t.nate).post(travel, {
        kind: 'hotel',
        name: 'Hotel de la Ville',
        city: 'Rome',
        checkIn: '2026-12-28',
        checkOut: '2027-01-02',
        rooms: 21,
        confirmation: 'HDV-20261228',
      }),
    );
    expect(hotel).toMatchObject({ kind: 'hotel', nights: 5, rooms: 21 });
    const bus = await json<Booking>(
      await api(t.nate).post(travel, {
        kind: 'bus',
        label: 'Bus A',
        company: 'Roma Coach',
        seats: 24,
        driverContact: '+39 06 000 0000',
        groups: ['Bus A'],
      }),
    );
    // Bus A: Minji, Juho and leader Kim; Hana's guardian is not a seat.
    expect(bus).toMatchObject({
      kind: 'bus',
      assigned: 3,
      seats: 24,
      driverContact: '+39 06 000 0000',
    });

    const plan = await json<TravelPlan>(await api(t.nate).get(travel));
    expect(plan.flights.map((f) => f.code)).toEqual(['DEMO 901']);
    expect(plan.hotels.map((h) => h.nights)).toEqual([5]);
    expect(plan.buses.map((b) => b.assigned)).toEqual([3]);

    // Patches: a delayed flight; the bus picks up Bus B too; a hotel patch on a flight is 409.
    const delayed = await json<Booking>(
      await api(t.nate).patch(`${travel}/${flight.id}`, { kind: 'flight', status: 'delayed' }),
    );
    // A status-only patch keeps the other fields (a partial schema must not refill defaults).
    expect(delayed).toMatchObject({ status: 'delayed', code: 'DEMO 901', pax: 42, pnr: 'VYS8K2' });
    const bigger = await json<Booking>(
      await api(t.nate).patch(`${travel}/${bus.id}`, { kind: 'bus', groups: ['Bus A', 'Bus B'] }),
    );
    expect(bigger).toMatchObject({ assigned: 4 });
    expect(
      (await api(t.nate).patch(`${travel}/${flight.id}`, { kind: 'hotel', rooms: 1 })).status,
    ).toBe(409);
    expect(
      (await api(t.nate).patch(`${travel}/${crypto.randomUUID()}`, { kind: 'flight', pax: 1 }))
        .status,
    ).toBe(404);

    // Validation.
    expect(
      (
        await api(t.nate).post(travel, {
          kind: 'hotel',
          name: 'X',
          city: 'Y',
          checkIn: '2027-01-02',
          checkOut: '2026-12-28',
        })
      ).status,
    ).toBe(400);
    expect(
      (await api(t.nate).patch(`${travel}/${hotel.id}`, { kind: 'hotel', checkOut: '2026-12-01' }))
        .status,
    ).toBe(400);
    expect(
      (await api(t.nate).post(travel, { kind: 'bus', label: 'B', company: 'C', seats: 0 })).status,
    ).toBe(400);
    expect(
      (
        await api(t.nate).post(travel, {
          kind: 'flight',
          code: 'X',
          from: 'A',
          to: 'B',
          departsAt: '1pm',
          arrivesAt: '2026-12-28T18:55',
        })
      ).status,
    ).toBe(400);
    expect((await api(t.nate).post(travel, { kind: 'train', code: 'X' })).status).toBe(400);

    // Roles: a leader reads; travelers, guardians and strangers do not; nobody but staff writes.
    const kimPlan = await api(t.kim).get(travel);
    expect(kimPlan.status).toBe(200);
    // D37: a leader reads the bus without the driver's contact; the organizer keeps it.
    const kimBuses = ((await kimPlan.json()) as { buses: { driverContact: string | null }[] })
      .buses;
    expect(kimBuses.length).toBeGreaterThan(0);
    expect(kimBuses.every((b) => b.driverContact === null)).toBe(true);
    const natePlan = (await (await api(t.nate).get(travel)).json()) as {
      buses: { driverContact: string | null }[];
    };
    expect(natePlan.buses.every((b) => b.driverContact === '+39 06 000 0000')).toBe(true);
    expect(
      (await api(t.kim).post(travel, { kind: 'bus', label: 'B', company: 'C', seats: 10 })).status,
    ).toBe(403);
    expect((await api(t.minji).get(travel)).status).toBe(403);
    expect((await api(t.sora).get(travel)).status).toBe(403);
    const stranger = await signIn('stranger@example.com');
    expect((await api(stranger).get(travel)).status).toBe(403);
    expect((await api(null).get(travel)).status).toBe(401);
    expect(
      (await api(t.nate).get(`/v1/orgs/${t.org.id}/trips/${crypto.randomUUID()}/travel`)).status,
    ).toBe(404);

    // Deletion.
    expect(await json(await api(t.nate).delete(`${travel}/${hotel.id}`))).toEqual({
      deleted: true,
      bookingId: hotel.id,
    });
    expect((await api(t.nate).delete(`${travel}/${hotel.id}`)).status).toBe(404);
    const after = await json<TravelPlan>(await api(t.nate).get(travel));
    expect(after.hotels).toEqual([]);
    expect(after.flights).toHaveLength(1);
  });

  it("the driver's sealed link: minted once, names only, counted, revocable (slice 049)", async () => {
    const t = await setupTrip();
    const travel = `${t.base}/travel`;
    const bus = await json<Booking>(
      await api(t.nate).post(travel, {
        kind: 'bus',
        label: 'Bus A',
        company: 'Roma Coach',
        seats: 24,
        driverContact: '+39 06 000 0000',
        groups: ['Bus A'],
      }),
    );
    const hotel = await json<Booking>(
      await api(t.nate).post(travel, {
        kind: 'hotel',
        name: 'Hotel de la Ville',
        city: 'Rome',
        checkIn: '2026-12-28',
        checkOut: '2027-01-02',
      }),
    );

    // Minted by the organizer; the URL carries the token in its fragment, once.
    const minted = await api(t.nate).post(`${travel}/${bus.id}/driver-links`);
    expect(minted.status).toBe(201);
    const { link, url } = await json<CreateDriverLinkResponse>(minted);
    const token = /#token=([A-Za-z0-9_-]+)$/.exec(url)?.[1] ?? '';
    expect(token.length).toBeGreaterThanOrEqual(40);
    expect(url.startsWith(`https://example.com/driver/${t.org.id}#token=`)).toBe(true);
    expect(link.opens).toBe(0);
    expect(link.revokedAt).toBeNull();
    expect(link.expiresAt > link.createdAt).toBe(true);
    // Not for a hotel, not by a leader or a traveler.
    expect((await api(t.nate).post(`${travel}/${hotel.id}/driver-links`)).status).toBe(404);
    expect((await api(t.kim).post(`${travel}/${bus.id}/driver-links`)).status).toBe(403);
    expect((await api(t.minji).post(`${travel}/${bus.id}/driver-links`)).status).toBe(403);

    // The driver opens the sheet without an account: names only, leaders first; the open counts.
    const opened = await openSheet(t.org.id, token);
    expect(opened.status).toBe(200);
    expect(opened.headers.get('cache-control')).toBe('no-store');
    const sheet = await json<DriverSheet>(opened);
    expect(sheet.organizationName).toBe('Seoul Arts High');
    expect(sheet.bus).toEqual({ label: 'Bus A', company: 'Roma Coach', seats: 24 });
    expect(sheet.groups).toEqual([
      { name: 'Bus A', leaders: ['Kim'], travelers: ['Juho Kim', 'Minji Park'] },
    ]);
    expect([sheet.leaders, sheet.travelers]).toEqual([1, 2]);
    expect(JSON.stringify(sheet)).not.toContain('+39');
    expect(JSON.stringify(sheet)).not.toContain('Sora');
    await openSheet(t.org.id, token);
    const listed = await json<DriverLinkList>(
      await api(t.nate).get(`${travel}/${bus.id}/driver-links`),
    );
    expect(listed.links.map((l) => [l.id, l.opens])).toEqual([[link.id, 2]]);
    expect(listed.links[0]?.lastOpenedAt).not.toBeNull();

    // Unknown, malformed and revoked tokens are one answer.
    expect(
      (
        await openSheet(
          t.org.id,
          token.replace(/.$/, (ch) => (ch === 'a' ? 'b' : 'a')),
        )
      ).status,
    ).toBe(404);
    expect((await openSheet(t.org.id, 'short')).status).toBe(400);
    expect((await openSheet(crypto.randomUUID(), token)).status).toBe(404);
    const revoked = await api(t.nate).delete(`${travel}/${bus.id}/driver-links/${link.id}`);
    expect(revoked.status).toBe(200);
    expect((await json<{ revokedAt: string | null }>(revoked)).revokedAt).not.toBeNull();
    expect((await openSheet(t.org.id, token)).status).toBe(404);
    expect(
      (await api(t.nate).delete(`${travel}/${bus.id}/driver-links/${crypto.randomUUID()}`)).status,
    ).toBe(404);

    // A second link works until the bus is deleted, which takes its links.
    const second = await json<CreateDriverLinkResponse>(
      await api(t.nate).post(`${travel}/${bus.id}/driver-links`),
    );
    const secondToken = /#token=([A-Za-z0-9_-]+)$/.exec(second.url)?.[1] ?? '';
    expect((await openSheet(t.org.id, secondToken)).status).toBe(200);
    expect((await api(t.nate).delete(`${travel}/${bus.id}`)).status).toBe(200);
    expect((await openSheet(t.org.id, secondToken)).status).toBe(404);
    expect((await api(t.nate).get(`${travel}/${bus.id}/driver-links`)).status).toBe(404);
  });

  it('a link expires thirty days out, or two days after the trip, never under a day', () => {
    expect(driverLinkExpiry('2026-10-12T10:00:00.000Z', '2027-01-07')).toBe(
      '2026-11-11T10:00:00.000Z',
    );
    expect(driverLinkExpiry('2026-12-30T10:00:00.000Z', '2027-01-07')).toBe(
      '2027-01-09T00:00:00.000Z',
    );
    expect(driverLinkExpiry('2027-01-09T10:00:00.000Z', '2027-01-07')).toBe(
      '2027-01-10T10:00:00.000Z',
    );
  });
});
