// Copyright 2026- At Day. All rights reserved.
// The two locales must share one structure, every referenced capture must exist, and the
// renderers must produce escaped, complete documents with the search metadata the build promises.

import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { en } from './en.ts';
import { ko } from './ko.ts';
import { legalDocs } from './legal.ts';
import { pilotHref, SITE, type SiteContent } from './model.ts';
import {
  esc,
  type RenderContext,
  renderLanding,
  renderLegalPage,
  renderNotFound,
  renderRobots,
  renderSitemap,
} from './render.ts';

const here = dirname(fileURLToPath(import.meta.url));
const captures = resolve(here, '..', '..', '..', '..', 'docs', 'captures', 'web', 'desktop-1440');

const ctx: RenderContext = {
  siteUrl: 'https://example.test',
  cssHref: '/assets/site.abc.css',
  jsHref: '/assets/site.def.js',
  images: {
    'command-center': '/img/cc.png',
    'itinerary-proposal': '/img/ip.png',
    'communication-live': '/img/cl.png',
    'safety-live': '/img/sl.png',
    'setup-3-roster': '/img/s3.png',
    'setup-4-invites': '/img/s4.png',
    people: '/img/pe.png',
    media: '/img/me.png',
    reports: '/img/re.png',
    billing: '/img/bi.png',
    'settings-live': '/img/st.png',
    'reports-live': '/img/rl.png',
    'safety-missing-live': '/img/sm.png',
    'communication-chat': '/img/cc2.png',
    'command-center-trips': '/img/cct.png',
    og: '/img/og.png',
  },
  phoneImages: Object.fromEntries(
    en.phones.shots.map((s) => [`${s.platform}/${s.file}`, `/img/${s.platform}-${s.file}.png`]),
  ),
  analyticsToken: null,
  buildId: 'test',
  updated: '2026-10-12',
};

function shape(c: SiteContent) {
  return {
    roles: c.roles.items.map((r) => r.id),
    phases: c.phases.groups.map((g) => ({
      id: g.id,
      features: g.features.map((f) => ({
        id: f.id,
        who: f.who,
        capture: f.capture?.file ?? null,
        decision: f.decision,
      })),
    })),
    trust: c.trust.items.length,
    platform: c.platform.items.length,
    faq: c.faq.items.length,
    includes: c.pricing.plan.includes.length,
    proof: c.hero.proof.length,
    shots: c.phones.shots.map((s) => `${s.platform}/${s.file}`),
  };
}

describe('content model', () => {
  it('en and ko share one structure (ids, order, roles, captures, decisions)', () => {
    expect(shape(ko)).toEqual(shape(en));
  });

  it('every referenced capture exists in docs/captures', () => {
    for (const g of en.phases.groups) {
      for (const f of g.features) {
        if (f.capture)
          expect(existsSync(join(captures, `${f.capture.file}.png`)), f.capture.file).toBe(true);
      }
    }
    expect(existsSync(join(captures, 'command-center.png'))).toBe(true);
    // The phone gallery (slice 040) shows the apps' own captures.
    for (const shot of en.phones.shots) {
      const file = join(captures, '..', '..', shot.platform, `${shot.file}.png`);
      expect(existsSync(file), `${shot.platform}/${shot.file}`).toBe(true);
    }
  });

  it('every feature names at least one decision and one role', () => {
    for (const c of [en, ko]) {
      for (const g of c.phases.groups) {
        for (const f of g.features) {
          expect(f.decision.length, f.id).toBeGreaterThan(0);
          expect(f.who.length, f.id).toBeGreaterThan(0);
          expect(f.details.length, f.id).toBeGreaterThan(0);
        }
      }
    }
  });

  it('legal docs exist for both locales and kinds, each with sections', () => {
    for (const l of ['en', 'ko'] as const) {
      for (const k of ['privacy', 'terms'] as const) {
        expect(legalDocs[l][k].sections.length).toBeGreaterThan(5);
      }
    }
    expect(legalDocs.ko.privacy.sections.length).toBe(legalDocs.en.privacy.sections.length);
    expect(legalDocs.ko.terms.sections.length).toBe(legalDocs.en.terms.sections.length);
  });
});

describe('renderers', () => {
  it('escapes HTML in content', () => {
    expect(esc(`<b>&"'`)).toBe('&lt;b&gt;&amp;&quot;&#39;');
  });

  it('renders the English landing with metadata, every feature, and both calls to action', () => {
    const html = renderLanding(en, ctx);
    expect(html.startsWith('<!doctype html>\n<html lang="en">')).toBe(true);
    expect(html).toContain('<link rel="canonical" href="https://example.test/">');
    expect(html).toContain('hreflang="ko" href="https://example.test/ko/"');
    expect(html).toContain('hreflang="x-default" href="https://example.test/"');
    expect(html).toContain('property="og:image" content="https://example.test/img/og.png"');
    expect(html).toContain(`<h1 id="hero-title" class="display">${esc(en.hero.title)}</h1>`);
    for (const g of en.phases.groups)
      for (const f of g.features) expect(html).toContain(esc(f.title));
    for (const f of en.faq.items) expect(html).toContain(esc(f.q));
    expect(html).toContain(`href="${esc(pilotHref('en'))}"`);
    expect(html).toContain(`href="${SITE.consoleUrl}"`);
    expect(html).not.toContain('undefined');
    expect(html).not.toContain('[object');
    expect(html).not.toContain('cloudflareinsights');
    // Features with a capture render the figure with its alt text.
    expect(html).toContain('src="/img/cl.png" alt="');
  });

  it('renders the Korean landing at /ko/ with the Korean headline and a switch back to English', () => {
    const html = renderLanding(ko, ctx);
    expect(html).toContain('<html lang="ko">');
    expect(html).toContain('<link rel="canonical" href="https://example.test/ko/">');
    expect(html).toContain(esc(ko.hero.title));
    expect(html).toContain('href="/" hreflang="en" lang="en" data-lang-switch>English</a>');
    expect(html).toContain('href="/ko/privacy/"');
  });

  it('adds the Cloudflare beacon only when a token is configured', () => {
    const html = renderLanding(en, { ...ctx, analyticsToken: 'tok123' });
    expect(html).toContain('static.cloudflareinsights.com/beacon.min.js');
    expect(html).toContain('"token": "tok123"');
  });

  it('renders legal pages with the draft notice, the date, and every section', () => {
    for (const l of [en, ko]) {
      for (const k of ['privacy', 'terms'] as const) {
        const html = renderLegalPage(l, k, ctx);
        expect(html).toContain(esc(l.legal.draftNotice));
        expect(html).toContain('2026-10-12');
        for (const s of legalDocs[l.locale][k].sections) expect(html).toContain(esc(s.title));
      }
    }
    expect(renderLegalPage(ko, 'terms', ctx)).toContain(
      '<link rel="canonical" href="https://example.test/ko/terms/">',
    );
  });

  it('renders a bilingual 404, a sitemap with six urls and alternates, and robots', () => {
    const nf = renderNotFound(en, ko, ctx);
    expect(nf).toContain('Page not found');
    expect(nf).toContain('페이지를 찾을 수 없습니다.');
    const sm = renderSitemap(ctx);
    expect(sm.match(/<url>/g)?.length).toBe(6);
    expect(sm).toContain('<loc>https://example.test/ko/privacy/</loc>');
    expect(sm).toContain('hreflang="en" href="https://example.test/privacy/"');
    expect(renderRobots(ctx)).toBe(
      'User-agent: *\nAllow: /\nSitemap: https://example.test/sitemap.xml\n',
    );
  });
});
