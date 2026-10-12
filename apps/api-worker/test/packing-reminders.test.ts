// Copyright 2026- At Day. All rights reserved.
// Facts (D38, D29; slice 056): on the morning three days before the start, from 09:00 in the
// trip's zone, every traveler and leader with packing left hears it once in the normal lane with
// the count and the missing names, and a guardian hears it for their traveler (a row waits for
// anyone who has not joined); a traveler who
// packed everything hears nothing; the run before 09:00 and the run on another morning write
// nothing; a second run writes nothing; the organizer's log reads the reminder as one event; a
// trip without items reminds nobody; the lane rule and the words in both languages.

import { env } from 'cloudflare:test';
import type { MyNotifications, NotificationLog, PackingItem } from '@voysemble/contracts';
import { describe, expect, it } from 'vitest';
import { laneFor } from '../src/lib/notification-rules';
import {
  daysUntil,
  reminderBody,
  reminderTitle,
  runPackingReminders,
} from '../src/lib/packing-reminders';
import { localClock, nowIso, plusDays, zonedToIso } from '../src/lib/time';
import { api, createOrg, json, SAMPLE_CSV, signIn } from './helpers';

const ZONE = 'Asia/Seoul';

describe('packing reminders (slice 056)', () => {
  it('reminds everyone with packing left on the morning three days before, once', async () => {
    const nate = await signIn('nate@example.com');
    const org = await createOrg(nate);
    // The run "happens" yesterday morning in Seoul, so what it delivers is in the inbox today.
    const runDate = plusDays(localClock(nowIso(), ZONE).date, -1);
    const startsOn = plusDays(runDate, 3);
    expect((await api(nate).patch(`/v1/orgs/${org.id}`, { defaultLocale: 'en' })).status).toBe(200);
    const trip = await json<{ id: string }>(
      await api(nate).post(`/v1/orgs/${org.id}/trips`, {
        name: 'Rome week',
        startsOn,
        endsOn: plusDays(startsOn, 5),
        timezone: ZONE,
      }),
    );
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
    const minji = await redeem('minji@example.com', 'Minji Park');
    const juho = await redeem('juho@example.com', 'Juho Kim');
    const sora = await redeem('sora@example.com', 'Sora Park');
    const kim = await redeem('kim@example.com', 'Kim');

    // No items yet: nobody is reminded.
    const morning = zonedToIso(runDate, '09:30', ZONE);
    expect(await runPackingReminders(env, morning)).toEqual({
      trips: 0,
      reminders: 0,
      skipped: 0,
      failed: 0,
    });

    const passport = await json<PackingItem>(
      await api(nate).post(`${base}/packing`, { name: 'Passport + copy' }),
    );
    const adapter = await json<PackingItem>(
      await api(nate).post(`${base}/packing`, { name: 'EU plug adapter' }),
    );
    // Minji packed the passport; Juho packed everything.
    expect(
      (await api(minji).put(`${base}/packing/${passport.id}/mine`, { packed: true })).status,
    ).toBe(200);
    expect(
      (await api(juho).put(`${base}/packing/${passport.id}/mine`, { packed: true })).status,
    ).toBe(200);
    expect(
      (await api(juho).put(`${base}/packing/${adapter.id}/mine`, { packed: true })).status,
    ).toBe(200);

    // Before 09:00 and on another morning: nothing.
    expect(await runPackingReminders(env, zonedToIso(runDate, '08:00', ZONE))).toEqual({
      trips: 0,
      reminders: 0,
      skipped: 0,
      failed: 0,
    });
    expect(await runPackingReminders(env, zonedToIso(plusDays(runDate, 1), '09:30', ZONE))).toEqual(
      { trips: 0, reminders: 0, skipped: 0, failed: 0 },
    );

    // The morning three days before: Minji, Hana (never joined; the row waits in her inbox), Kim,
    // Sora (for Minji) and Hana's guardian (for Hana, waiting too); Juho is done.
    const run = await runPackingReminders(env, morning);
    expect(run).toEqual({ trips: 1, reminders: 5, skipped: 0, failed: 0 });
    const mine = async (c: Parameters<typeof api>[0]) =>
      json<MyNotifications>(await api(c).get(`${base}/notifications/mine`));
    const minjiInbox = await mine(minji);
    expect(
      minjiInbox.notifications.map((n) => [n.kind, n.lane, n.title, n.body, n.refType]),
    ).toEqual([
      [
        'packing_reminder',
        'normal',
        'Packing: 3 days to go',
        '1 of 2 still to pack: EU plug adapter',
        'packing',
      ],
    ]);
    expect((await mine(sora)).notifications[0]?.body).toBe(
      "Minji Park's list: 1 of 2 still to pack: EU plug adapter",
    );
    expect((await mine(kim)).notifications[0]?.body).toBe(
      '2 of 2 still to pack: Passport + copy, EU plug adapter',
    );
    expect((await mine(juho)).notifications).toEqual([]);

    // Again: nothing new. The log reads one event with five normal-lane rows.
    expect(await runPackingReminders(env, morning)).toEqual({
      trips: 1,
      reminders: 0,
      skipped: 5,
      failed: 0,
    });
    const log = await json<NotificationLog>(await api(nate).get(`${base}/notifications`));
    const reminders = log.events.filter((e) => e.kind === 'packing_reminder');
    expect(reminders).toHaveLength(1);
    expect(reminders[0]?.lanes).toEqual({ priority: 0, normal: 5, digest: 0 });
    expect(reminders[0]?.refId).toBe(`packing:${startsOn}:3`);
  });

  it('lane rule, calendar rule and the words in both languages', () => {
    expect(laneFor('traveler', 'packing_reminder')).toBe('normal');
    expect(laneFor('leader', 'packing_reminder')).toBe('normal');
    expect(laneFor('guardian', 'packing_reminder')).toBe('normal');
    expect(daysUntil('2026-12-23', '2026-12-26')).toBe(3);
    expect(daysUntil('2026-12-27', '2026-12-26')).toBe(-1);
    expect(reminderTitle('en', 3)).toBe('Packing: 3 days to go');
    expect(reminderTitle('en', 1)).toBe('Packing: the trip starts tomorrow');
    expect(reminderTitle('ko', 3)).toBe('준비물: 출발 3일 전');
    expect(reminderTitle('ko', 1)).toBe('준비물: 출발 하루 전');
    const target = {
      participationId: 'p',
      role: 'guardian' as const,
      displayName: 'Sora Park',
      forTraveler: 'Minji Park',
      packed: 5,
      total: 9,
      missing: [
        'EU plug adapter',
        'Medication with doctor note',
        'Pocket money (EUR)',
        'Warm coat',
      ],
    };
    expect(reminderBody('en', target)).toBe(
      "Minji Park's list: 4 of 9 still to pack: EU plug adapter, Medication with doctor note, Pocket money (EUR), …",
    );
    expect(reminderBody('ko', { ...target, forTraveler: null, missing: ['여권'], packed: 8 })).toBe(
      '9개 중 1개가 아직 남았습니다: 여권',
    );
    expect(reminderBody('ko', target)).toBe(
      'Minji Park의 준비물 9개 중 4개가 아직 남았습니다: EU plug adapter, Medication with doctor note, Pocket money (EUR) 외',
    );
  });
});
