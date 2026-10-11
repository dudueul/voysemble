// Copyright 2026- At Day. All rights reserved.
// Facts: Hangul detects as ko, otherwise en; the Workers AI port sends the m2m100 model with the
// locale pair (and the gateway when configured) and validates a non-empty string; a thrown error
// or junk output degrades to null; the fixture port answers only its canned pairs; port
// selection follows the binding and the environment.

import { describe, expect, it } from 'vitest';
import {
  aiPort,
  DisabledAiPort,
  detectLocale,
  FixtureAiPort,
  otherLocale,
  TRANSLATION_MODEL,
  WorkersAiPort,
} from '../src/ai/AiPort';

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
});
