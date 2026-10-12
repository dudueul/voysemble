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

/** Image moderation (D18, slice 043): the thumbnail is judged, the original is only for the fixture. */
export interface ImageModerationRequest {
  thumbnail: Uint8Array;
  original: Uint8Array;
  contentType: string;
}

export type ImageFlag = 'nudity' | 'non_member_minor' | 'violence';

export interface AiPort {
  /** Translated text, or null when the provider is unavailable, errored, or has no answer. */
  translate(input: TranslationRequest): Promise<string | null>;
  /** A flag for a leader to review, or null (clean, unavailable, errored, unsure). Never a verdict. */
  moderateImage(input: ImageModerationRequest): Promise<ImageFlag | null>;
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

/**
 * Workers AI vision model used as a classifier: asked for one word, the answer is parsed into a
 * flag or nothing. Output is never stored; it only decides whether a leader reviews first.
 */
export const IMAGE_MODERATION_MODEL = '@cf/llava-hf/llava-1.5-7b-hf';
const MODERATION_PROMPT =
  "You screen photos from a school trip for a human reviewer. Answer with exactly one word: NUDITY if the image shows nudity or sexual content, VIOLENCE if it shows blood, weapons or violence, CHILD if it is a close-up of a child's face who is not part of a group photo, otherwise NONE.";

type TranslationAi = {
  run(
    model: string,
    input:
      | { text: string; source_lang: string; target_lang: string }
      | { image: number[]; prompt: string; max_tokens: number },
    options?: { gateway?: { id: string } },
  ): Promise<unknown>;
};

/** The model's free text to a flag: the first keyword wins; anything else is "no flag". */
export function flagFromAnswer(answer: string): ImageFlag | null {
  const a = answer.toUpperCase();
  if (/\bNUDITY\b/.test(a)) return 'nudity';
  if (/\bVIOLENCE\b/.test(a)) return 'violence';
  if (/\bCHILD\b/.test(a)) return 'non_member_minor';
  return null;
}

/** The fixture's marker: ASCII `voysemble-flag:<flag>` anywhere in the original's bytes. */
export function fixtureFlagOf(bytes: Uint8Array): ImageFlag | null {
  const marker = 'voysemble-flag:';
  const first = marker.charCodeAt(0);
  outer: for (let i = 0; i + marker.length < bytes.length; i++) {
    if (bytes[i] !== first) continue;
    for (let j = 1; j < marker.length; j++) {
      if (bytes[i + j] !== marker.charCodeAt(j)) continue outer;
    }
    let rest = '';
    for (let k = i + marker.length; k < Math.min(bytes.length, i + marker.length + 20); k++) {
      const ch = bytes[k] ?? 0;
      if (ch < 0x61 || ch > 0x7a) {
        if (ch !== 0x5f) break;
      }
      rest += String.fromCharCode(ch);
    }
    if (rest === 'nudity' || rest === 'violence' || rest === 'non_member_minor') return rest;
    return null;
  }
  return null;
}

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

  async moderateImage(input: ImageModerationRequest): Promise<ImageFlag | null> {
    try {
      const out = await this.ai.run(
        IMAGE_MODERATION_MODEL,
        { image: Array.from(input.thumbnail), prompt: MODERATION_PROMPT, max_tokens: 8 },
        this.gatewayId ? { gateway: { id: this.gatewayId } } : undefined,
      );
      const answer = (out as { description?: unknown } | null)?.description;
      return typeof answer === 'string' ? flagFromAnswer(answer) : null;
    } catch {
      // No model, no budget: the photo goes to the pool unflagged; the leader can still remove it.
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

  /** Deterministic: a marker in the uploaded bytes (tests and the browser suite plant it). */
  async moderateImage(input: ImageModerationRequest): Promise<ImageFlag | null> {
    return fixtureFlagOf(input.original) ?? fixtureFlagOf(input.thumbnail);
  }
}

export class DisabledAiPort implements AiPort {
  readonly provider = 'disabled' as const;
  async translate(): Promise<string | null> {
    return null;
  }
  async moderateImage(): Promise<ImageFlag | null> {
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
