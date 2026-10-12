// Copyright 2026- At Day. All rights reserved.
// Facts (D29, slice 054): a revision announcement shared with guardians lands in Sora's digest
// lane and in no email before the digest hour; the run after the digest hour mails Sora once (her
// trip's updates, in her language, tagged digest), marks the rows and the log counts them as
// emailed; a guardian who never joined is marked without an email and keeps the row in the inbox
// for later; a second run has nothing to send; a send that fails leaves the rows for the next
// run; the template lists each item with its wall-clock time in the trip's zone.

import { env } from 'cloudflare:test';
import type { MyNotifications, NotificationLog } from '@voysemble/contracts';
import { describe, expect, it } from 'vitest';
import { FixtureEmailPort, type OutboundEmail } from '../src/email/EmailPort';
import { digestEmail } from '../src/email/templates';
import { runDigests } from '../src/lib/digest';
import { plusDays } from '../src/lib/time';
import { api, createOrg, createTrip, json, SAMPLE_CSV, signIn } from './helpers';

async function publishTwice(
  nate: Parameters<typeof api>[0],
  base: string,
  trip: { startsOn: string; timezone: string },
) {
  const eventId = crypto.randomUUID();
  const event = (start: string, end: string) => ({
    date: trip.startsOn,
    start,
    end,
    timeZone: trip.timezone,
    kind: 'meal',
    title: 'Breakfast',
    place: 'Hotel',
    pax: null,
    status: 'scheduled',
    note: null,
    order: 1,
  });
  expect(
    (await api(nate).put(`${base}/itinerary/events/${eventId}`, event('09:00', '10:00'))).status,
  ).toBe(200);
  expect(
    (
      await api(nate).post(`${base}/itinerary/publish`, {
        expectedRevision: 0,
        notify: true,
        note: null,
      })
    ).status,
  ).toBe(200);
  expect(
    (await api(nate).put(`${base}/itinerary/events/${eventId}`, event('09:30', '10:30'))).status,
  ).toBe(200);
  expect(
    (
      await api(nate).post(`${base}/itinerary/publish`, {
        expectedRevision: 1,
        notify: true,
        note: null,
      })
    ).status,
  ).toBe(200);
}

describe('the guardian digest email (slice 054)', () => {
  it('mails the digest lane once after the digest hour and marks the rows', async () => {
    const nate = await signIn('nate@example.com');
    const org = await createOrg(nate);
    const trip = await createTrip(nate, org.id);
    const base = `/v1/orgs/${org.id}/trips/${trip.id}`;
    await api(nate).post(`${base}/roster/import`, { csv: SAMPLE_CSV });
    const issued = await json<{ invites: { displayName: string; code: string }[] }>(
      await api(nate).post(`${base}/invites`),
    );
    const sora = await signIn('sora@example.com');
    const code = issued.invites.find((i) => i.displayName === 'Sora Park')?.code;
    expect((await api(sora).post('/v1/invites/redeem', { code })).status).toBe(200);
    // Hana's guardian ("Hana Mom") never joins: her rows have no account to mail.

    await publishTwice(nate, base, trip);
    const soraInbox = async () =>
      json<MyNotifications>(await api(sora).get(`${base}/notifications/mine`));
    const now = new Date().toISOString();
    const later = `${plusDays(now.slice(0, 10), 2)}T12:00:00.000Z`;
    // The row waits for the digest hour: nothing in the inbox or the mail yet.
    expect((await soraInbox()).notifications).toEqual([]);
    const early = await runDigests(env, now);
    expect(early).toEqual({ organizations: 0, emails: 0, rows: 0, skipped: 0, failed: 0 });
    if (!env.DEV_MAILBOX) throw new Error('DEV_MAILBOX missing in test env');
    const before = await FixtureEmailPort.latest(env.DEV_MAILBOX, 'sora@example.com');
    expect(before?.tag).toBe('magic-link');

    // After the digest hour: one email to Sora, Hana Mom's row marked without one.
    const run = await runDigests(env, later);
    expect(run).toEqual({ organizations: 1, emails: 1, rows: 2, skipped: 1, failed: 0 });
    const mail = await FixtureEmailPort.latest(env.DEV_MAILBOX, 'sora@example.com');
    expect(mail?.tag).toBe('digest');
    expect(mail?.locale).toBe('en');
    expect(mail?.subject).toBe(`${trip.name}: your guardian digest (1 update)`);
    expect(mail?.text).toContain(org.name);
    // The revision announcement is written in the organization's language (Korean by default);
    // the moved event is named either way.
    expect(mail?.text).toContain('Breakfast');
    expect(mail?.text).not.toContain('#token=');
    // The inbox route reads the real clock, still before the digest hour: the row is not
    // delivered there yet (it will be, at the digest hour, whether or not the mail went).
    expect((await soraInbox()).notifications).toEqual([]);
    // The organizer's log: two digest rows (Sora, Hana Mom), one emailed.
    const log = await json<NotificationLog>(await api(nate).get(`${base}/notifications`));
    const revision = log.events.find((e) => e.kind === 'itinerary_revision');
    expect(revision?.lanes.digest).toBe(2);
    expect(revision?.emailed).toBe(1);

    // A second run has nothing to send.
    expect(await runDigests(env, later)).toEqual({
      organizations: 0,
      emails: 0,
      rows: 0,
      skipped: 0,
      failed: 0,
    });
  });

  it('leaves the rows for the next run when the send fails', async () => {
    const nate = await signIn('nate2@example.com');
    const org = await createOrg(nate);
    const trip = await createTrip(nate, org.id);
    const base = `/v1/orgs/${org.id}/trips/${trip.id}`;
    await api(nate).post(`${base}/roster/import`, { csv: SAMPLE_CSV });
    const issued = await json<{ invites: { displayName: string; code: string }[] }>(
      await api(nate).post(`${base}/invites`),
    );
    const sora = await signIn('sora2@example.com');
    const code = issued.invites.find((i) => i.displayName === 'Sora Park')?.code;
    expect((await api(sora).post('/v1/invites/redeem', { code })).status).toBe(200);
    await publishTwice(nate, base, trip);
    const later = `${plusDays(new Date().toISOString().slice(0, 10), 2)}T12:00:00.000Z`;
    const broken = {
      send: async () => {
        throw new Error('transport down');
      },
    };
    const failed = await runDigests(env, later, broken);
    // Sora's send failed (rows kept); Hana Mom's row is marked without an email.
    expect(failed).toEqual({ organizations: 1, emails: 0, rows: 1, skipped: 1, failed: 1 });
    const sent: OutboundEmail[] = [];
    const working = {
      send: async (m: OutboundEmail) => {
        sent.push(m);
      },
    };
    const retry = await runDigests(env, later, working);
    expect(retry).toEqual({ organizations: 1, emails: 1, rows: 1, skipped: 0, failed: 0 });
    expect(sent.map((m) => m.to)).toEqual(['sora2@example.com']);
  });

  it('writes the template in both languages with the trip-zone clock', () => {
    const items = [
      {
        title: 'Itinerary updated',
        body: 'Breakfast moved to 09:30.',
        createdAt: '2026-12-31T05:31:00.000Z',
      },
      { title: 'Room list', body: '', createdAt: '2026-12-31T06:00:00.000Z' },
    ];
    const en = digestEmail(
      'g@example.com',
      'en',
      'Seoul Arts High',
      'Korea Concert Tour',
      'Europe/Rome',
      items,
    );
    expect(en.subject).toBe('Korea Concert Tour: your guardian digest (2 updates)');
    expect(en.text).toContain(
      '- 2026-12-31 06:31 · Itinerary updated\n  Breakfast moved to 09:30.',
    );
    expect(en.text).toContain('- 2026-12-31 07:00 · Room list\n');
    expect(en.tag).toBe('digest');
    const ko = digestEmail(
      'g@example.com',
      'ko',
      'Seoul Arts High',
      'Korea Concert Tour',
      'Asia/Seoul',
      items.slice(0, 1),
    );
    expect(ko.subject).toBe('Korea Concert Tour 보호자 요약 (1건)');
    expect(ko.text).toContain('- 2026-12-31 14:31 · Itinerary updated');
    expect(ko.locale).toBe('ko');
  });
});
