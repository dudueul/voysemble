// Copyright 2026- At Day. All rights reserved.
//
// The content model of the public site. One `SiteContent` per locale (en.ts, ko.ts) feeds the
// same renderer, so the two pages can never drift in structure, only in words. Every feature
// text traces to a decision in docs/planning/decision-log.md (the `decision` field is kept for
// maintainers and never rendered: the page describes the decided product without build-status
// tags, D30).

export type Locale = 'en' | 'ko';

export type RoleId = 'organizer' | 'leader' | 'traveler' | 'guardian';

export interface Link {
  label: string;
  href: string;
}

export interface Feature {
  id: string;
  title: string;
  /** One or two sentences a buyer reads first. */
  summary: string;
  /** The thorough part: concrete behaviour, in the words of the decision. */
  details: string[];
  /** Decision ids this text was written from, e.g. ['D16']. Not rendered. */
  decision: string[];
  /** Who this feature is for; rendered as small role chips. */
  who: RoleId[];
  /** A real console capture illustrating the feature, by capture file name (without .png). */
  capture?: { file: CaptureName; alt: string };
}

export type CaptureName =
  | 'command-center'
  | 'itinerary-proposal'
  | 'communication-live'
  | 'safety-live'
  | 'setup-3-roster'
  | 'setup-4-invites'
  | 'people'
  | 'media'
  | 'reports'
  | 'billing'
  | 'settings-live'
  | 'reports-live'
  | 'safety-missing-live'
  | 'communication-chat'
  | 'command-center-trips';

/** Phone captures (docs/captures/ios, docs/captures/android) the gallery shows, by file name. */
export type PhoneCaptureName =
  | 'today-light'
  | 'plan-day'
  | 'today-ko'
  | 'plan-day-ko'
  | 'headcount-open'
  | 'chats-thread-dark'
  | 'window-open'
  | 'bulletin-light'
  | 'today-trip-switch'
  | 'rooming-light'
  | 'inbox-light'
  | 'today-help'
  | 'today-room'
  | 'incidents-new';

export interface PhoneShot {
  platform: 'ios' | 'android';
  file: PhoneCaptureName;
  alt: string;
  /** The short line under the frame. */
  label: string;
}

/** Real captures from the apps' test runs (D31), shown in device frames (slice 040). */
export interface PhoneGallery {
  title: string;
  lead: string;
  caption: string;
  shots: PhoneShot[];
}

export interface Phase {
  id: string;
  title: string;
  lead: string;
  features: Feature[];
}

export interface Role {
  id: RoleId;
  name: string;
  device: string;
  summary: string;
  bullets: string[];
}

export interface Stat {
  value: string;
  label: string;
}

export interface FaqItem {
  q: string;
  a: string;
}

export interface SiteContent {
  locale: Locale;
  /** The locale's own language name for the switch, and the other locale's. */
  langName: string;
  otherLang: { label: string; locale: Locale };
  meta: {
    title: string;
    description: string;
    ogTitle: string;
    ogDescription: string;
  };
  nav: {
    features: string;
    roles: string;
    trust: string;
    pricing: string;
    faq: string;
    console: string;
    pilot: string;
    menu: string;
  };
  hero: {
    eyebrow: string;
    title: string;
    lead: string;
    primary: string;
    secondary: string;
    proof: string[];
    captureAlt: string;
  };
  roles: { title: string; lead: string; items: Role[]; widen: string };
  phases: { title: string; lead: string; groups: Phase[] };
  phones: PhoneGallery;
  trust: { title: string; lead: string; items: { title: string; body: string }[] };
  platform: { title: string; lead: string; items: { title: string; body: string }[] };
  pricing: {
    title: string;
    lead: string;
    plan: { name: string; who: string; includes: string[]; note: string; cta: string };
    ledger: { title: string; body: string };
    seats: string;
  };
  faq: { title: string; items: FaqItem[] };
  cta: { title: string; body: string; primary: string; secondary: string };
  footer: {
    tagline: string;
    product: string;
    legal: string;
    privacy: string;
    terms: string;
    company: string;
    copyright: string;
  };
  legal: {
    draftNotice: string;
    backHome: string;
    updated: string;
  };
}

/** Site-wide constants that are not copy. */
export const SITE = {
  /** Primary call to action: a founder-owned mailbox on the product domain (needs forwarding). */
  pilotEmail: 'hello@voysemble.com',
  pilotSubject: { en: 'Voysemble pilot', ko: 'Voysemble 파일럿 문의' } as const,
  /** The organizer console (ADR-0008). */
  consoleUrl: 'https://app.voysemble.com/',
  /** Canonical origin for hreflang, Open Graph and the sitemap; overridden by SITE_URL at build. */
  siteUrl: 'https://voysemble.com',
  company: 'At Day',
} as const;

export function pilotHref(locale: Locale): string {
  return `mailto:${SITE.pilotEmail}?subject=${encodeURIComponent(SITE.pilotSubject[locale])}`;
}

/** Path prefix of a locale: '' for the root language, '/ko' for Korean. */
export function localePrefix(locale: Locale): string {
  return locale === 'en' ? '' : `/${locale}`;
}
