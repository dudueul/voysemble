// Copyright 2026- At Day. All rights reserved.
// Facts: Hangul detects as ko, otherwise en; the Workers AI port sends the m2m100 model with the
// locale pair (and the gateway when configured) and validates a non-empty string; a thrown error
// or junk output degrades to null; the fixture port answers only its canned pairs; port
// selection follows the binding and the environment.

import type { DisruptionDraftRequest } from '@voysemble/contracts';
import { describe, expect, it } from 'vitest';
import {
  aiPort,
  DISRUPTION_MODEL,
  DisabledAiPort,
  detectLocale,
  draftsFromAnswer,
  FixtureAiPort,
  fixtureDrafts,
  jsonArrayIn,
  otherLocale,
  TRANSLATION_MODEL,
  WorkersAiPort,
} from '../src/ai/AiPort';

const E1 = 'aaaaaaaa-0000-4000-8000-000000000001';
const E2 = 'aaaaaaaa-0000-4000-8000-000000000002';
const E3 = 'aaaaaaaa-0000-4000-8000-000000000003';
const E4 = 'aaaaaaaa-0000-4000-8000-000000000004';

/** Breakfast slips 20: the bus is pushed to 10:20, lunch and the walk keep their time. */
const SLIP: DisruptionDraftRequest = {
  date: '2026-12-28',
  slippedEventId: E1,
  minutes: 20,
  locale: 'en',
  events: [
    {
      id: E1,
      title: 'Breakfast',
      kind: 'meal',
      start: '09:00',
      end: '10:00',
      newStart: '09:20',
      newEnd: '10:20',
    },
    {
      id: E2,
      title: 'Bus to Colosseum',
      kind: 'bus',
      start: '10:10',
      end: null,
      newStart: '10:20',
      newEnd: null,
    },
    {
      id: E3,
      title: 'Lunch',
      kind: 'meal',
      start: '12:30',
      end: '13:30',
      newStart: null,
      newEnd: null,
    },
    {
      id: E4,
      title: 'Forum walk',
      kind: 'activity',
      start: '14:00',
      end: '16:00',
      newStart: null,
      newEnd: null,
    },
  ],
};

describe('AI port', () => {
  it('detects locale and flips it', () => {
    expect(detectLocale('로비. 버스 07:15.')).toBe('ko');
    expect(detectLocale('Lobby. Bus 07:15.')).toBe('en');
    expect(otherLocale('ko')).toBe('en');
    expect(otherLocale('en')).toBe('ko');
  });

  it('Workers AI port: model, locale pair, gateway, validated output, failures as null', async () => {
    const calls: unknown[] = [];
    const ai = {
      run: async (model: string, input: unknown, options?: unknown) => {
        calls.push([model, input, options]);
        return { translated_text: '  로비. 버스 07:15.  ' };
      },
    };
    const port = new WorkersAiPort(ai, 'gw-1');
    expect(await port.translate({ text: 'Lobby. Bus 07:15.', source: 'en', target: 'ko' })).toBe(
      '로비. 버스 07:15.',
    );
    expect(calls).toEqual([
      [
        TRANSLATION_MODEL,
        { text: 'Lobby. Bus 07:15.', source_lang: 'en', target_lang: 'ko' },
        { gateway: { id: 'gw-1' } },
      ],
    ]);
    const noGateway = new WorkersAiPort({ run: async () => ({ translated_text: 'x' }) });
    expect(await noGateway.translate({ text: 'a', source: 'en', target: 'ko' })).toBe('x');

    const junk = new WorkersAiPort({ run: async () => ({ translated_text: '   ' }) });
    expect(await junk.translate({ text: 'a', source: 'en', target: 'ko' })).toBeNull();
    const throwing = new WorkersAiPort({
      run: async () => {
        throw new Error('neurons exhausted');
      },
    });
    expect(await throwing.translate({ text: 'a', source: 'en', target: 'ko' })).toBeNull();
  });

  it('fixture port answers canned pairs both ways and nothing else; selection by env', async () => {
    const fixture = new FixtureAiPort();
    expect(await fixture.translate({ text: 'Lobby. Bus 07:15.', source: 'en', target: 'ko' })).toBe(
      '로비. 버스 07:15.',
    );
    expect(await fixture.translate({ text: '로비. 버스 07:15.', source: 'ko', target: 'en' })).toBe(
      'Lobby. Bus 07:15.',
    );
    expect(
      await fixture.translate({ text: 'Anything else', source: 'en', target: 'ko' }),
    ).toBeNull();
    expect(await new DisabledAiPort().translate()).toBeNull();

    expect(aiPort({ ENV_NAME: 'local' }).provider).toBe('fixture');
    expect(aiPort({ ENV_NAME: 'production' }).provider).toBe('disabled');
    expect(aiPort({ ENV_NAME: 'production', AI: { run: async () => null } }).provider).toBe(
      'workers-ai',
    );
  });

  it('fixture drafts: absorb, shorten the longest later event, cut the last activity (slice 055)', async () => {
    const drafts = fixtureDrafts(SLIP);
    expect(drafts.map((d) => d.title)).toEqual([
      'Absorb the slip',
      'Shorten Forum walk',
      'Cut Forum walk',
    ]);
    expect(drafts[0]?.actions).toEqual([
      { eventId: E1, action: 'move', start: '09:20', end: '10:20' },
      { eventId: E2, action: 'move', start: '10:20', end: null },
    ]);
    // The walk loses the twenty minutes; nothing after it moves.
    expect(drafts[1]?.actions.find((a) => a.eventId === E4)).toEqual({
      eventId: E4,
      action: 'shorten',
      start: '14:00',
      end: '15:40',
    });
    expect(drafts[1]?.actions.filter((a) => a.action === 'move').map((a) => a.eventId)).toEqual([
      E1,
      E2,
    ]);
    expect(drafts[2]?.actions.find((a) => a.eventId === E4)?.action).toBe('cut');
    expect(drafts[2]?.rationale).toContain('Forum walk');
    const ko = fixtureDrafts({ ...SLIP, locale: 'ko' });
    expect(ko[0]?.title).toBe('지연을 그대로 흡수');
    expect(ko[1]?.title).toBe('Forum walk 단축');
    // A chain with nothing to shorten or cut still absorbs.
    const short = fixtureDrafts({ ...SLIP, events: SLIP.events.slice(0, 2) });
    expect(short.map((d) => d.title)).toEqual(['Absorb the slip']);
    expect(await new FixtureAiPort().draftDisruption(SLIP)).toHaveLength(3);
    expect(await new DisabledAiPort().draftDisruption()).toBeNull();
  });

  it('Workers AI drafts: JSON mode, validated, unknown ids dropped, junk and failures null', async () => {
    const calls: unknown[] = [];
    const answer = JSON.stringify([
      {
        title: 'Absorb',
        rationale: 'Move on.',
        actions: [
          { eventId: E1, action: 'move', start: '09:20', end: '10:20' },
          { eventId: 'not-an-id', action: 'cut', start: null, end: null },
        ],
      },
      {
        title: 'Nothing known',
        rationale: 'x',
        actions: [
          {
            eventId: 'ffffffff-0000-4000-8000-000000000009',
            action: 'cut',
            start: null,
            end: null,
          },
        ],
      },
    ]);
    const ai = {
      run: async (model: string, _input: unknown, options?: unknown) => {
        calls.push([model, options]);
        return { response: `Here you go:\n${answer}` };
      },
    };
    const port = new WorkersAiPort(ai, 'gw-1');
    const drafts = await port.draftDisruption(SLIP);
    expect(calls).toEqual([[DISRUPTION_MODEL, { gateway: { id: 'gw-1' } }]]);
    expect(drafts).toEqual([
      {
        title: 'Absorb',
        rationale: 'Move on.',
        actions: [{ eventId: E1, action: 'move', start: '09:20', end: '10:20' }],
      },
    ]);
    expect(draftsFromAnswer('[]', SLIP.events)).toBeNull();
    expect(draftsFromAnswer('not json', SLIP.events)).toBeNull();
    expect(draftsFromAnswer([{ title: 'x' }], SLIP.events)).toBeNull();
    expect(jsonArrayIn('text [1, 2] more')).toEqual([1, 2]);
    expect(jsonArrayIn('no array')).toBeNull();
    const throwing = new WorkersAiPort({
      run: async () => {
        throw new Error('neurons exhausted');
      },
    });
    expect(await throwing.draftDisruption(SLIP)).toBeNull();
    expect(
      await new WorkersAiPort({ run: async () => ({ response: 42 }) }).draftDisruption(SLIP),
    ).toBeNull();
  });
});
