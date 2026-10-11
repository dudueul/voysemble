// Copyright 2026- At Day. All rights reserved.
//
// AI boundary on the server (ADR-0006, D03, D16). One port, three implementations:
// `WorkersAiPort` (the `AI` binding, through AI Gateway when `AI_GATEWAY_ID` is set),
// `FixtureAiPort` (local and tests: a small canned dictionary, deterministic), and
// `DisabledAiPort` (no binding in a deployed environment: honest "no translation").
// AI never writes canonical data here: the caller stores what the port returns, labelled.
// ADR-0006 placed the interface in `packages/effect-runtime`; that package does not exist, so
// the port lives next to its only consumer until a second Worker needs it.

export type Locale = 'ko' | 'en';

export interface TranslationRequest {
  text: string;
  source: Locale;
  target: Locale;
}

export interface AiPort {
  /** Translated text, or null when the provider is unavailable, errored, or has no answer. */
  translate(input: TranslationRequest): Promise<string | null>;
  readonly provider: 'workers-ai' | 'fixture' | 'disabled';
}

/** Hangul syllables or jamo anywhere → Korean; otherwise English (the two supported locales). */
export function detectLocale(text: string): Locale {
  return /[ᄀ-ᇿ㄰-㆏가-힯]/.test(text) ? 'ko' : 'en';
}

export function otherLocale(locale: Locale): Locale {
  return locale === 'ko' ? 'en' : 'ko';
}

/** Workers AI text translation model (m2m100). Output is validated as a non-empty string. */
export const TRANSLATION_MODEL = '@cf/meta/m2m100-1.2b';

type TranslationAi = {
  run(
    model: string,
    input: { text: string; source_lang: string; target_lang: string },
    options?: { gateway?: { id: string } },
  ): Promise<unknown>;
};

export class WorkersAiPort implements AiPort {
  readonly provider = 'workers-ai' as const;
  constructor(
    private readonly ai: TranslationAi,
    private readonly gatewayId?: string,
  ) {}

  async translate(input: TranslationRequest): Promise<string | null> {
    try {
      const out = await this.ai.run(
        TRANSLATION_MODEL,
        { text: input.text, source_lang: input.source, target_lang: input.target },
        this.gatewayId ? { gateway: { id: this.gatewayId } } : undefined,
      );
      const text = (out as { translated_text?: unknown } | null)?.translated_text;
      return typeof text === 'string' && text.trim().length > 0 ? text.trim() : null;
    } catch {
      // Budget exhausted, model unavailable, gateway refused: degrade to "no translation".
      return null;
    }
  }
}

/** Canned KO/EN pairs for the sample announcements; anything else gets no translation. */
const FIXTURE_PAIRS: [en: string, ko: string][] = [
  ['Lobby. Bus 07:15.', '로비. 버스 07:15.'],
  ['Lobby. Bus leaves 07:15.', '로비. 버스는 07:15에 출발합니다.'],
  [
    'Please bring your concert attire. Breakfast is open from 06:30.',
    '공연 의상을 꼭 챙겨 주세요. 아침 식사는 06:30부터입니다.',
  ],
  ['Choir in rows 1-4.', '합창단은 1-4열입니다.'],
  ['Please.', '부탁드립니다.'],
];

export class FixtureAiPort implements AiPort {
  readonly provider = 'fixture' as const;
  async translate(input: TranslationRequest): Promise<string | null> {
    const text = input.text.trim();
    for (const [en, ko] of FIXTURE_PAIRS) {
      if (input.source === 'en' && text === en) return ko;
      if (input.source === 'ko' && text === ko) return en;
    }
    return null;
  }
}

export class DisabledAiPort implements AiPort {
  readonly provider = 'disabled' as const;
  async translate(): Promise<string | null> {
    return null;
  }
}

/** Binding present → Workers AI; local without it → fixture; deployed without it → disabled. */
export function aiPort(env: {
  AI?: TranslationAi;
  AI_GATEWAY_ID?: string;
  ENV_NAME: string;
}): AiPort {
  if (env.AI) return new WorkersAiPort(env.AI, env.AI_GATEWAY_ID);
  if (env.ENV_NAME === 'local') return new FixtureAiPort();
  return new DisabledAiPort();
}
