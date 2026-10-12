// Copyright 2026- At Day. All rights reserved.
//
// AI boundary on the server (ADR-0006, D03, D16, D19). One port, three implementations:
// `WorkersAiPort` (the `AI` binding, through AI Gateway when `AI_GATEWAY_ID` is set),
// `FixtureAiPort` (local and tests: a small canned dictionary, deterministic), and
// `DisabledAiPort` (no binding in a deployed environment: honest "no translation").
// AI never writes canonical data here: the caller stores what the port returns, labelled.
// ADR-0006 placed the interface in `packages/effect-runtime`; that package does not exist, so
// the port lives next to its only consumer until a second Worker needs it.

import {
  DisruptionDraft,
  type DisruptionDraftEvent,
  type DisruptionDraftRequest,
} from '@voysemble/contracts';

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
  /**
   * Disruption drafts (D19, slice 055): two or three ways through a slipped day (move, shorten,
   * cut), each with a one-line rationale, or null when the provider has no answer. The organizer
   * applies one to the draft and publishes; the port never writes.
   */
  draftDisruption(input: DisruptionDraftRequest): Promise<DisruptionDraft[] | null>;
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

/**
 * Workers AI text model for the disruption drafts: asked for JSON in a fixed shape (the model's
 * JSON mode), validated against the contract, every unknown event id dropped. Nothing it says is
 * stored; the organizer applies a draft by hand.
 */
export const DISRUPTION_MODEL = '@cf/meta/llama-3.1-8b-instruct';

const DISRUPTION_SYSTEM =
  'You help the organizer of a school or youth group trip replan one day after a delay. You get the day\'s remaining events in order, each with its planned start and end and, when the delay pushed it, its new start and end. Answer with JSON only: an array of two or three drafts, each {"title": string (at most 8 words), "rationale": string (one sentence, at most 40 words), "actions": [{"eventId": string, "action": "move"|"shorten"|"cut"|"keep", "start": "HH:mm" or null, "end": "HH:mm" or null}]}. Use only the given event ids. "move" gives the new start (and end when the event had one); "shorten" gives the new end; "cut" drops the event; "keep" leaves it. One draft absorbs the delay by moving; the others shorten or cut later events so the day ends on time. Meals and transport are rarely cut. Write the title and rationale in the requested language.';

export const DRAFT_JSON_SCHEMA = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      title: { type: 'string' },
      rationale: { type: 'string' },
      actions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            eventId: { type: 'string' },
            action: { type: 'string', enum: ['move', 'shorten', 'cut', 'keep'] },
            start: { type: ['string', 'null'] },
            end: { type: ['string', 'null'] },
          },
          required: ['eventId', 'action', 'start', 'end'],
        },
      },
    },
    required: ['title', 'rationale', 'actions'],
  },
} as const;

type TranslationAi = {
  run(
    model: string,
    input:
      | { text: string; source_lang: string; target_lang: string }
      | { image: number[]; prompt: string; max_tokens: number }
      | {
          messages: { role: 'system' | 'user'; content: string }[];
          max_tokens: number;
          response_format?: { type: 'json_schema'; json_schema: unknown };
        },
    options?: { gateway?: { id: string } },
  ): Promise<unknown>;
};

/** The first JSON array in the model's text (JSON mode answers with it alone; others wrap it). */
export function jsonArrayIn(text: string): unknown {
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

/**
 * The model's answer as drafts: validated against the contract, unknown event ids dropped, a
 * draft without actions dropped, at most three. Null when nothing survives.
 */
export function draftsFromAnswer(
  answer: unknown,
  events: DisruptionDraftEvent[],
): DisruptionDraft[] | null {
  const raw = typeof answer === 'string' ? jsonArrayIn(answer) : answer;
  if (!Array.isArray(raw)) return null;
  const known = new Set(events.map((e) => e.id));
  // Unknown ids go before validation: a model that invents one must not sink the whole answer.
  const cleaned = raw.map((d) => {
    if (!d || typeof d !== 'object') return d;
    const actions = (d as { actions?: unknown }).actions;
    return {
      ...(d as object),
      actions: Array.isArray(actions)
        ? actions.filter(
            (a) =>
              a !== null &&
              typeof a === 'object' &&
              known.has(String((a as { eventId?: unknown }).eventId)),
          )
        : [],
    };
  });
  const parsed = DisruptionDraft.array().safeParse(cleaned);
  if (!parsed.success) return null;
  const drafts = parsed.data.filter((d) => d.actions.length > 0).slice(0, 3);
  return drafts.length > 0 ? drafts : null;
}

const minutesOf = (hhmm: string): number => {
  const [h = 0, m = 0] = hhmm.split(':').map(Number);
  return h * 60 + m;
};
const hhmm = (m: number): string => {
  const c = Math.min(Math.max(0, m), 23 * 60 + 59);
  return `${String(Math.floor(c / 60)).padStart(2, '0')}:${String(c % 60).padStart(2, '0')}`;
};

/**
 * The deterministic drafts for local use and tests (and the shape the model is asked for):
 * absorb the slip by moving; shorten the longest later event by the slip so what follows it
 * keeps its time; cut the last later activity, free time or meal. Rationales in the locale.
 */
export function fixtureDrafts(input: DisruptionDraftRequest): DisruptionDraft[] {
  const ko = input.locale === 'ko';
  const slipped = input.events.find((e) => e.id === input.slippedEventId) ?? input.events[0];
  if (!slipped) return [];
  const moved = input.events.filter((e) => e.newStart !== null);
  const moveAll = moved.map((e) => ({
    eventId: e.id,
    action: 'move' as const,
    start: e.newStart,
    end: e.newEnd,
  }));
  const drafts: DisruptionDraft[] = [
    {
      title: ko ? '지연을 그대로 흡수' : 'Absorb the slip',
      rationale: ko
        ? `${slipped.title} 이후 일정은 여유가 다할 때까지 밀리고, 빠지는 일정은 없습니다.`
        : `Everything after ${slipped.title} moves as the slack runs out; nothing is cut.`,
      actions: moveAll,
    },
  ];
  const later = input.events.filter((e) => e.id !== slipped.id);
  const longest = later
    .filter((e) => e.end !== null && minutesOf(e.end) - minutesOf(e.start) >= input.minutes + 15)
    .sort(
      (a, b) =>
        minutesOf(b.end ?? b.start) -
        minutesOf(b.start) -
        (minutesOf(a.end ?? a.start) - minutesOf(a.start)),
    )[0];
  if (longest) {
    const idx = input.events.findIndex((e) => e.id === longest.id);
    const newStart = longest.newStart ?? longest.start;
    const newEnd = hhmm(minutesOf(longest.newEnd ?? longest.end ?? longest.start) - input.minutes);
    drafts.push({
      title: ko ? `${longest.title} 단축` : `Shorten ${longest.title}`,
      rationale: ko
        ? `${longest.title}을(를) ${input.minutes}분 줄이면 그 뒤 일정은 원래 시각을 지킵니다.`
        : `Taking ${input.minutes} minutes off ${longest.title} lets what follows keep its time.`,
      actions: [
        ...input.events
          .slice(0, idx)
          .filter((e) => e.newStart !== null)
          .map((e) => ({
            eventId: e.id,
            action: 'move' as const,
            start: e.newStart,
            end: e.newEnd,
          })),
        { eventId: longest.id, action: 'shorten' as const, start: newStart, end: newEnd },
        ...input.events
          .slice(idx + 1)
          .map((e) => ({ eventId: e.id, action: 'keep' as const, start: null, end: null })),
      ],
    });
  }
  const cuttable = [...later]
    .reverse()
    .find((e) => e.kind === 'activity' || e.kind === 'free' || e.kind === 'meal');
  if (cuttable) {
    drafts.push({
      title: ko ? `${cuttable.title} 취소` : `Cut ${cuttable.title}`,
      rationale: ko
        ? `${cuttable.title}을(를) 빼면 하루가 제시간에 끝나고 나머지는 밀린 대로 갑니다.`
        : `Dropping ${cuttable.title} ends the day on time; the rest goes as moved.`,
      actions: [
        ...moveAll.filter((a) => a.eventId !== cuttable.id),
        { eventId: cuttable.id, action: 'cut' as const, start: null, end: null },
      ],
    });
  }
  return drafts;
}

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

  async draftDisruption(input: DisruptionDraftRequest): Promise<DisruptionDraft[] | null> {
    try {
      const user = JSON.stringify({
        language: input.locale === 'ko' ? 'Korean' : 'English',
        date: input.date,
        delayMinutes: input.minutes,
        slippedEventId: input.slippedEventId,
        events: input.events,
      });
      const out = await this.ai.run(
        DISRUPTION_MODEL,
        {
          messages: [
            { role: 'system', content: DISRUPTION_SYSTEM },
            { role: 'user', content: user },
          ],
          max_tokens: 1200,
          response_format: { type: 'json_schema', json_schema: DRAFT_JSON_SCHEMA },
        },
        this.gatewayId ? { gateway: { id: this.gatewayId } } : undefined,
      );
      const answer = (out as { response?: unknown } | null)?.response;
      return draftsFromAnswer(answer, input.events);
    } catch {
      // No model, no budget, a refused gateway: the organizer plans from the chain by hand.
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

  async draftDisruption(input: DisruptionDraftRequest): Promise<DisruptionDraft[] | null> {
    const drafts = fixtureDrafts(input);
    return drafts.length > 0 ? drafts : null;
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
  async draftDisruption(): Promise<DisruptionDraft[] | null> {
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
