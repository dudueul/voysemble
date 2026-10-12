// Copyright 2026- At Day. All rights reserved.
// Facts (D27, D29; slice 060): a reminder for a requirement reaches every traveler still missing
// it and the guardians bound to them, once a day, in the normal lane, with the document and the
// due date in the body; a collected traveler and their guardian hear nothing; a second call the
// same day writes nothing and says so; the log reads one event; a requirement with nothing
// missing reminds nobody; a leader cannot send it; an unknown requirement is 404; the words in
// both languages.

import type {
  DocumentRemindResponse,
  DocumentRequirement,
  MyNotifications,
  NotificationLog,
} from '@voysemble/contracts';
import { describe, expect, it } from 'vitest';
import { documentReminderBody, documentReminderTitle } from '../src/routes/documents';
import { api, createOrg, createTrip, json, SAMPLE_CSV, signIn } from './helpers';

describe('document reminders (slice 060)', () => {
  it('reminds the missing travelers and their guardians once a day', async () => {
    const nate = await signIn('nate@example.com');
    const org = await createOrg(nate);
    const trip = await createTrip(nate, org.id);
    const base = `/v1/orgs/${org.id}/trips/${trip.id}`;
    // English words, no quiet hours (the trip lives in Seoul; the normal lane must deliver now).
    expect(
      (
        await api(nate).patch(`/v1/orgs/${org.id}`, {
          defaultLocale: 'en',
          settings: { quietHours: { from: '09:00', to: '09:00' } },
        })
      ).status,
    ).toBe(200);
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
    const juho = await redeem('juho@example.com', 'Juho Kim');
    const sora = await redeem('sora@example.com', 'Sora Park');

    const passport = await json<DocumentRequirement>(
      await api(nate).post(`${base}/documents`, {
        name: 'Passport copy',
        required: true,
        dueOn: '2026-12-10',
      }),
    );
    const roster = await json<{ participations: { id: string; displayName: string }[] }>(
      await api(nate).get(`${base}/roster`),
    );
    const minjiId = roster.participations.find((p) => p.displayName === 'Minji Park')?.id ?? '';
    expect(
      (
        await api(nate).put(`${base}/documents/${passport.id}/items/${minjiId}`, {
          state: 'collected',
        })
      ).status,
    ).toBe(200);

    // Juho (no guardian), Hana and Hana's guardian; not Minji, not Sora, not Kim.
    const first = await json<DocumentRemindResponse>(
      await api(nate).post(`${base}/documents/${passport.id}/remind`),
    );
    expect(first).toEqual({ missing: 2, reminded: 3, skipped: 0 });
    const mine = async (c: Parameters<typeof api>[0]) =>
      json<MyNotifications>(await api(c).get(`${base}/notifications/mine`));
    const juhoInbox = await mine(juho);
    expect(
      juhoInbox.notifications.map((n) => [n.kind, n.lane, n.title, n.body, n.refType]),
    ).toEqual([
      [
        'document_reminder',
        'normal',
        'Documents: Passport copy still needed',
        'Juho Kim: Passport copy not handed in yet, due 2026-12-10. Give it to the organizer or a group leader.',
        'document',
      ],
    ]);
    expect((await mine(minji)).notifications).toEqual([]);
    expect((await mine(sora)).notifications).toEqual([]);
    expect((await mine(kim)).notifications).toEqual([]);

    // The same day: nothing new. The log reads one event with three normal-lane rows.
    const again = await json<DocumentRemindResponse>(
      await api(nate).post(`${base}/documents/${passport.id}/remind`),
    );
    expect(again).toEqual({ missing: 2, reminded: 0, skipped: 3 });
    const log = await json<NotificationLog>(await api(nate).get(`${base}/notifications`));
    const events = log.events.filter((e) => e.kind === 'document_reminder');
    expect(events).toHaveLength(1);
    expect(events[0]?.lanes).toEqual({ priority: 0, normal: 3, digest: 0 });
    expect(events[0]?.refId).toMatch(new RegExp(`^document:${passport.id}:\\d{4}-\\d{2}-\\d{2}$`));

    // Nothing missing: nobody reminded. A leader cannot send it; an unknown requirement is 404.
    const consent = await json<DocumentRequirement>(
      await api(nate).post(`${base}/documents`, { name: 'Consent form', required: false }),
    );
    for (const p of roster.participations) {
      await api(nate).put(`${base}/documents/${consent.id}/items/${p.id}`, { state: 'waived' });
    }
    expect(
      await json<DocumentRemindResponse>(
        await api(nate).post(`${base}/documents/${consent.id}/remind`),
      ),
    ).toEqual({ missing: 0, reminded: 0, skipped: 0 });
    expect((await api(kim).post(`${base}/documents/${passport.id}/remind`)).status).toBe(403);
    expect((await api(nate).post(`${base}/documents/${crypto.randomUUID()}/remind`)).status).toBe(
      404,
    );
  });

  it('writes the title and the body in both languages', () => {
    expect(documentReminderTitle('en', 'Passport copy')).toBe(
      'Documents: Passport copy still needed',
    );
    expect(documentReminderTitle('ko', '여권 사본')).toBe('서류: 여권 사본이(가) 아직 필요합니다');
    expect(documentReminderBody('en', 'Minji Park', 'Passport copy', null)).toBe(
      'Minji Park: Passport copy not handed in yet. Give it to the organizer or a group leader.',
    );
    expect(documentReminderBody('ko', 'Minji Park', '여권 사본', '2026-12-10')).toBe(
      'Minji Park: 여권 사본이(가) 아직 제출되지 않았습니다. 기한은 2026-12-10입니다. 주최자나 인솔자에게 전달해 주세요.',
    );
  });
});
