// Copyright 2026- At Day. All rights reserved.
//
// Pure HTML renderers: `SiteContent` + a `RenderContext` in, a complete document out. No DOM, no
// framework, no runtime templating: the build runs these once per page and writes the result.
// Every string from the content model passes through `esc`; the only raw HTML is written here.

import { type LegalDoc, type LegalKind, legalDocs } from './legal.ts';
import {
  type CaptureName,
  type Locale,
  localePrefix,
  type PhoneFrames,
  pilotHref,
  type RoleId,
  SITE,
  type SiteContent,
} from './model.ts';

export interface RenderContext {
  /** Canonical origin without a trailing slash, e.g. https://voysemble.com. */
  siteUrl: string;
  cssHref: string;
  jsHref: string;
  /** Hashed public paths of the captures and the Open Graph image. */
  images: Record<CaptureName | 'og', string>;
  /** Cloudflare Web Analytics site token; the beacon is omitted when null. */
  analyticsToken: string | null;
  buildId: string;
  /** ISO date stamped on the legal pages. */
  updated: string;
}

export function esc(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

const LOCALES: Locale[] = ['en', 'ko'];
const OG_LOCALE: Record<Locale, string> = { en: 'en_US', ko: 'ko_KR' };

/** Absolute URL of a page path ('/', '/ko/', '/privacy/') for a locale. */
export function pageUrl(
  ctx: RenderContext,
  locale: Locale,
  path: '/' | '/privacy/' | '/terms/',
): string {
  return `${ctx.siteUrl}${localePrefix(locale)}${path}`;
}

const LOGO_SVG =
  '<svg width="28" height="28" viewBox="0 0 32 32" aria-hidden="true"><path d="M4 7l12 19L28 7" fill="none" stroke="#2563EB" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><circle cx="24" cy="8" r="4" fill="#F59E0B"/></svg>';

function faviconHref(): string {
  return `data:image/svg+xml,${encodeURIComponent(LOGO_SVG)}`;
}

function head(
  c: SiteContent,
  ctx: RenderContext,
  page: {
    title: string;
    description: string;
    path: '/' | '/privacy/' | '/terms/';
    ogTitle: string;
    ogDescription: string;
  },
): string {
  const canonical = pageUrl(ctx, c.locale, page.path);
  const alternates = LOCALES.map(
    (l) => `<link rel="alternate" hreflang="${l}" href="${esc(pageUrl(ctx, l, page.path))}">`,
  ).join('\n    ');
  const beacon = ctx.analyticsToken
    ? `\n    <script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token": "${esc(ctx.analyticsToken)}"}'></script>`
    : '';
  return `<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${esc(page.title)}</title>
    <meta name="description" content="${esc(page.description)}">
    <link rel="canonical" href="${esc(canonical)}">
    ${alternates}
    <link rel="alternate" hreflang="x-default" href="${esc(pageUrl(ctx, 'en', page.path))}">
    <meta property="og:type" content="website">
    <meta property="og:site_name" content="Voysemble">
    <meta property="og:url" content="${esc(canonical)}">
    <meta property="og:title" content="${esc(page.ogTitle)}">
    <meta property="og:description" content="${esc(page.ogDescription)}">
    <meta property="og:image" content="${esc(ctx.siteUrl + ctx.images.og)}">
    <meta property="og:locale" content="${OG_LOCALE[c.locale]}">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="theme-color" content="#2563EB">
    <meta name="generator" content="voysemble-public-web ${esc(ctx.buildId)}">
    <link rel="icon" href="${faviconHref()}">
    <link rel="stylesheet" href="${esc(ctx.cssHref)}">
    <script defer src="${esc(ctx.jsHref)}"></script>${beacon}
  </head>`;
}

function header(c: SiteContent, home: boolean): string {
  const prefix = localePrefix(c.locale);
  const anchor = (id: string) => (home ? `#${id}` : `${prefix}/#${id}`);
  const otherPath = `${localePrefix(c.otherLang.locale)}/`;
  return `<header class="site-header">
    <div class="wrap site-header__row">
      <a class="brand" href="${prefix}/" aria-label="Voysemble">${LOGO_SVG}<span class="brand__name">Voysemble</span></a>
      <button class="nav-toggle" type="button" aria-expanded="false" aria-controls="site-nav" data-nav-toggle>${esc(c.nav.menu)}</button>
      <nav class="site-nav" id="site-nav" aria-label="Site">
        <a href="${anchor('features')}">${esc(c.nav.features)}</a>
        <a href="${anchor('roles')}">${esc(c.nav.roles)}</a>
        <a href="${anchor('trust')}">${esc(c.nav.trust)}</a>
        <a href="${anchor('pricing')}">${esc(c.nav.pricing)}</a>
        <a href="${anchor('faq')}">${esc(c.nav.faq)}</a>
        <a class="site-nav__lang" href="${otherPath}" hreflang="${c.otherLang.locale}" lang="${c.otherLang.locale}" data-lang-switch>${esc(c.otherLang.label)}</a>
        <a class="btn btn--ghost" href="${esc(SITE.consoleUrl)}">${esc(c.nav.console)}</a>
        <a class="btn btn--primary" href="${esc(pilotHref(c.locale))}">${esc(c.nav.pilot)}</a>
      </nav>
    </div>
  </header>`;
}

function footer(c: SiteContent, ctx: RenderContext): string {
  const prefix = localePrefix(c.locale);
  const otherPath = `${localePrefix(c.otherLang.locale)}/`;
  return `<footer class="site-footer">
    <div class="wrap site-footer__grid">
      <div>
        <a class="brand" href="${prefix}/">${LOGO_SVG}<span class="brand__name">Voysemble</span></a>
        <p class="muted">${esc(c.footer.tagline)}</p>
        <p class="muted small">${esc(c.footer.company)}</p>
      </div>
      <div>
        <h2 class="site-footer__title">${esc(c.footer.product)}</h2>
        <a href="${prefix}/#features">${esc(c.nav.features)}</a>
        <a href="${prefix}/#roles">${esc(c.nav.roles)}</a>
        <a href="${prefix}/#pricing">${esc(c.nav.pricing)}</a>
        <a href="${prefix}/#faq">${esc(c.nav.faq)}</a>
        <a href="${esc(SITE.consoleUrl)}">${esc(c.nav.console)}</a>
      </div>
      <div>
        <h2 class="site-footer__title">${esc(c.footer.legal)}</h2>
        <a href="${prefix}/privacy/">${esc(c.footer.privacy)}</a>
        <a href="${prefix}/terms/">${esc(c.footer.terms)}</a>
        <a href="${otherPath}" hreflang="${c.otherLang.locale}" lang="${c.otherLang.locale}">${esc(c.otherLang.label)}</a>
        <a href="${esc(pilotHref(c.locale))}">${esc(SITE.pilotEmail)}</a>
      </div>
    </div>
    <div class="wrap site-footer__legal muted small">${esc(c.footer.copyright)} · ${esc(ctx.buildId)}</div>
  </footer>`;
}

function roleChips(c: SiteContent, who: RoleId[]): string {
  const names = new Map(c.roles.items.map((r) => [r.id, r.name]));
  return `<ul class="chips chips--roles" aria-label="${esc(c.nav.roles)}">${who
    .map((id) => `<li class="chip chip--role chip--${id}">${esc(names.get(id) ?? id)}</li>`)
    .join('')}</ul>`;
}

function browserFrame(src: string, alt: string, eager = false): string {
  return `<figure class="browser">
      <div class="browser__bar" aria-hidden="true"><span></span><span></span><span></span></div>
      <img src="${esc(src)}" alt="${esc(alt)}" width="1440" height="960"${eager ? ' fetchpriority="high"' : ' loading="lazy"'}>
    </figure>`;
}

function hero(c: SiteContent, ctx: RenderContext): string {
  return `<section class="hero" aria-labelledby="hero-title">
    <div class="wrap hero__grid">
      <div class="hero__copy">
        <p class="eyebrow">${esc(c.hero.eyebrow)}</p>
        <h1 id="hero-title" class="display">${esc(c.hero.title)}</h1>
        <p class="lead">${esc(c.hero.lead)}</p>
        <div class="actions">
          <a class="btn btn--primary btn--lg" href="${esc(pilotHref(c.locale))}" data-cta="pilot">${esc(c.hero.primary)}</a>
          <a class="btn btn--ghost btn--lg" href="${esc(SITE.consoleUrl)}" data-cta="console">${esc(c.hero.secondary)}</a>
        </div>
        <ul class="chips chips--proof">${c.hero.proof.map((p) => `<li class="chip">${esc(p)}</li>`).join('')}</ul>
      </div>
      <div class="hero__visual">${browserFrame(ctx.images['command-center'], c.hero.captureAlt, true)}</div>
    </div>
  </section>`;
}

function roles(c: SiteContent): string {
  return `<section class="section" id="roles" aria-labelledby="roles-title">
    <div class="wrap">
      <h2 id="roles-title" class="section__title">${esc(c.roles.title)}</h2>
      <p class="section__lead">${esc(c.roles.lead)}</p>
      <div class="grid grid--4">${c.roles.items
        .map(
          (r) => `<article class="card role role--${r.id}">
          <p class="role__device">${esc(r.device)}</p>
          <h3 class="card__title">${esc(r.name)}</h3>
          <p>${esc(r.summary)}</p>
          <ul class="bullets">${r.bullets.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>
        </article>`,
        )
        .join('')}</div>
      <p class="section__note">${esc(c.roles.widen)}</p>
    </div>
  </section>`;
}

function phoneToday(p: PhoneFrames['today']): string {
  return `<div class="phone" data-phone="today">
      <div class="phone__status" aria-hidden="true"><span>${esc(p.now)}</span><span>●●●</span></div>
      <div class="phone__screen">
        <header class="phone__header"><div><p class="phone__kicker">${esc(p.trip)}</p><p class="phone__title">${esc(p.screen)}</p><p class="phone__sub">${esc(p.day)}</p></div><span class="pill pill--live">${esc(p.live)}</span></header>
        <p class="phone__label">${esc(p.upNext)}</p>
        <ul class="phone__events">${p.events
          .map(
            (e) =>
              `<li><span class="phone__time">${esc(e.time)}</span><span class="phone__event"><strong>${esc(e.title)}</strong><small>${esc(e.place)}</small></span>${
                e.status ? `<span class="pill pill--warn">${esc(e.status)}</span>` : ''
              }</li>`,
          )
          .join('')}</ul>
        <div class="phone__card phone__card--ack">
          <strong>${esc(p.announcementTitle)}</strong>
          <p>${esc(p.announcementBody)}</p>
          <small>${esc(p.announcementMeta)}</small>
          <span class="phone__btn">${esc(p.gotIt)}</span>
        </div>
        <p class="phone__label">${esc(p.headcount)}</p>
        <ul class="phone__groups">${p.groups.map((g) => `<li><span>${esc(g.label)}</span><strong>${esc(g.count)}</strong></li>`).join('')}</ul>
      </div>
    </div>`;
}

function phoneHeadcount(p: PhoneFrames['headcount']): string {
  return `<div class="phone" data-phone="headcount">
      <div class="phone__status" aria-hidden="true"><span>06:58</span><span>●●○</span></div>
      <div class="phone__screen">
        <header class="phone__header"><div><p class="phone__kicker">${esc(p.screen)}</p><p class="phone__title">${esc(p.group)}</p><p class="phone__sub">${esc(p.openedBy)}</p></div></header>
        <p class="phone__big">${esc(p.present)}</p>
        <p class="phone__label phone__label--danger">${esc(p.missingTitle)}</p>
        <ul class="phone__missing">${p.missing
          .map(
            (m) =>
              `<li><strong>${esc(m.name)}</strong><small>${esc(m.room)} · ${esc(m.lastAck)}</small><span class="pill pill--stale">${esc(m.window)}</span></li>`,
          )
          .join('')}</ul>
        <div class="phone__actions">${p.actions.map((a) => `<span class="phone__btn phone__btn--ghost">${esc(a)}</span>`).join('')}</div>
        <span class="phone__btn phone__btn--wide">${esc(p.close)}</span>
        <p class="phone__note">${esc(p.pending)}</p>
      </div>
    </div>`;
}

function phoneBulletin(p: PhoneFrames['bulletin']): string {
  return `<div class="phone" data-phone="bulletin">
      <div class="phone__status" aria-hidden="true"><span>22:14</span><span>●●●</span></div>
      <div class="phone__screen">
        <header class="phone__header"><div><p class="phone__title">${esc(p.screen)}</p></div></header>
        <div class="phone__card">
          <span class="pill pill--brand">${esc(p.revisionChip)}</span>
          <strong>${esc(p.revisionTitle)}</strong>
          <ul class="phone__lines">${p.lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>
          <small class="phone__ok">${esc(p.acked)}</small>
        </div>
        <div class="phone__card phone__card--ack">
          <strong>${esc(p.itemTitle)}</strong>
          <p>${esc(p.itemBody)}</p>
          <div class="phone__translation"><small>${esc(p.translationLabel)}</small><p>${esc(p.translation)}</p></div>
          <small>${esc(p.requiresAck)}</small>
          <span class="phone__btn">${esc(p.gotIt)}</span>
        </div>
      </div>
    </div>`;
}

function phones(c: SiteContent): string {
  return `<section class="section section--phones" id="phones" aria-label="${esc(c.phones.today.screen)}">
    <div class="wrap">
      <div class="phones">${phoneToday(c.phones.today)}${phoneHeadcount(c.phones.headcount)}${phoneBulletin(c.phones.bulletin)}</div>
      <p class="section__note small muted">${esc(c.phones.caption)}</p>
    </div>
  </section>`;
}

function features(c: SiteContent, ctx: RenderContext): string {
  return `<section class="section" id="features" aria-labelledby="features-title">
    <div class="wrap">
      <h2 id="features-title" class="section__title">${esc(c.phases.title)}</h2>
      <p class="section__lead">${esc(c.phases.lead)}</p>
      ${c.phases.groups
        .map(
          (g) => `<div class="phase" id="phase-${esc(g.id)}">
        <h3 class="phase__title">${esc(g.title)}</h3>
        <p class="phase__lead">${esc(g.lead)}</p>
        <div class="grid grid--features">${g.features
          .map(
            (
              f,
            ) => `<article class="card feature${f.capture ? ' feature--wide' : ''}" id="feature-${esc(f.id)}">
            <div class="feature__text">
              <h4 class="card__title">${esc(f.title)}</h4>
              <p class="feature__summary">${esc(f.summary)}</p>
              <ul class="bullets">${f.details.map((d) => `<li>${esc(d)}</li>`).join('')}</ul>
              ${roleChips(c, f.who)}
            </div>
            ${f.capture ? `<div class="feature__visual">${browserFrame(ctx.images[f.capture.file], f.capture.alt)}</div>` : ''}
          </article>`,
          )
          .join('')}</div>
      </div>`,
        )
        .join('')}
    </div>
  </section>`;
}

function trust(c: SiteContent): string {
  return `<section class="section section--tinted" id="trust" aria-labelledby="trust-title">
    <div class="wrap">
      <h2 id="trust-title" class="section__title">${esc(c.trust.title)}</h2>
      <p class="section__lead">${esc(c.trust.lead)}</p>
      <div class="grid grid--4">${c.trust.items
        .map(
          (t) =>
            `<article class="card card--flat"><h3 class="card__title">${esc(t.title)}</h3><p>${esc(t.body)}</p></article>`,
        )
        .join('')}</div>
    </div>
  </section>`;
}

function platform(c: SiteContent): string {
  return `<section class="section" id="platform" aria-labelledby="platform-title">
    <div class="wrap">
      <h2 id="platform-title" class="section__title">${esc(c.platform.title)}</h2>
      <p class="section__lead">${esc(c.platform.lead)}</p>
      <div class="grid grid--3">${c.platform.items
        .map(
          (t) =>
            `<article class="card"><h3 class="card__title">${esc(t.title)}</h3><p>${esc(t.body)}</p></article>`,
        )
        .join('')}</div>
    </div>
  </section>`;
}

function pricing(c: SiteContent): string {
  return `<section class="section section--tinted" id="pricing" aria-labelledby="pricing-title">
    <div class="wrap">
      <h2 id="pricing-title" class="section__title">${esc(c.pricing.title)}</h2>
      <p class="section__lead">${esc(c.pricing.lead)}</p>
      <div class="grid grid--pricing">
        <article class="card card--plan">
          <h3 class="card__title">${esc(c.pricing.plan.name)}</h3>
          <p class="muted">${esc(c.pricing.plan.who)}</p>
          <ul class="bullets bullets--check">${c.pricing.plan.includes.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>
          <p>${esc(c.pricing.plan.note)}</p>
          <a class="btn btn--primary" href="${esc(pilotHref(c.locale))}" data-cta="pricing">${esc(c.pricing.plan.cta)}</a>
        </article>
        <article class="card">
          <h3 class="card__title">${esc(c.pricing.ledger.title)}</h3>
          <p>${esc(c.pricing.ledger.body)}</p>
          <p class="muted">${esc(c.pricing.seats)}</p>
        </article>
      </div>
    </div>
  </section>`;
}

function faq(c: SiteContent): string {
  return `<section class="section" id="faq" aria-labelledby="faq-title">
    <div class="wrap wrap--narrow">
      <h2 id="faq-title" class="section__title">${esc(c.faq.title)}</h2>
      <div class="faq">${c.faq.items
        .map(
          (f) =>
            `<details class="faq__item"><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`,
        )
        .join('')}</div>
    </div>
  </section>`;
}

function ctaBand(c: SiteContent): string {
  return `<section class="cta-band" aria-labelledby="cta-title">
    <div class="wrap cta-band__row">
      <div>
        <h2 id="cta-title" class="section__title">${esc(c.cta.title)}</h2>
        <p class="section__lead">${esc(c.cta.body)}</p>
      </div>
      <div class="actions">
        <a class="btn btn--primary btn--lg" href="${esc(pilotHref(c.locale))}" data-cta="pilot-bottom">${esc(c.cta.primary)}</a>
        <a class="btn btn--ghost btn--lg" href="${esc(SITE.consoleUrl)}">${esc(c.cta.secondary)}</a>
      </div>
    </div>
  </section>`;
}

/** The landing page of a locale. */
export function renderLanding(c: SiteContent, ctx: RenderContext): string {
  return `<!doctype html>
<html lang="${c.locale}">
  ${head(c, ctx, {
    title: c.meta.title,
    description: c.meta.description,
    path: '/',
    ogTitle: c.meta.ogTitle,
    ogDescription: c.meta.ogDescription,
  })}
  <body>
    ${header(c, true)}
    <main id="main">
      ${hero(c, ctx)}
      ${roles(c)}
      ${phones(c)}
      ${features(c, ctx)}
      ${trust(c)}
      ${platform(c)}
      ${pricing(c)}
      ${faq(c)}
      ${ctaBand(c)}
    </main>
    ${footer(c, ctx)}
  </body>
</html>
`;
}

/** A legal page (privacy or terms) of a locale, with the draft notice on top. */
export function renderLegalPage(c: SiteContent, kind: LegalKind, ctx: RenderContext): string {
  const doc: LegalDoc = legalDocs[c.locale][kind];
  const prefix = localePrefix(c.locale);
  const path = kind === 'privacy' ? '/privacy/' : '/terms/';
  return `<!doctype html>
<html lang="${c.locale}">
  ${head(c, ctx, {
    title: `${doc.title} · Voysemble`,
    description: doc.intro,
    path,
    ogTitle: `${doc.title} · Voysemble`,
    ogDescription: doc.intro,
  })}
  <body>
    ${header(c, false)}
    <main id="main" class="legal">
      <div class="wrap wrap--narrow">
        <p class="notice notice--draft" role="note">${esc(c.legal.draftNotice)}</p>
        <h1 class="display">${esc(doc.title)}</h1>
        <p class="muted small">${esc(c.legal.updated)}: ${esc(ctx.updated)}</p>
        <p class="lead">${esc(doc.intro)}</p>
        ${doc.sections
          .map(
            (s) => `<section>
          <h2>${esc(s.title)}</h2>
          ${s.paragraphs.map((p) => `<p>${esc(p)}</p>`).join('')}
          ${s.bullets ? `<ul class="bullets">${s.bullets.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>` : ''}
        </section>`,
          )
          .join('')}
        <p><a class="btn btn--ghost" href="${prefix}/">${esc(c.legal.backHome)}</a></p>
      </div>
    </main>
    ${footer(c, ctx)}
  </body>
</html>
`;
}

/** The 404 page, bilingual, served by the assets-only Worker for unknown paths. */
export function renderNotFound(en: SiteContent, ko: SiteContent, ctx: RenderContext): string {
  return `<!doctype html>
<html lang="en">
  ${head(en, ctx, {
    title: 'Page not found · Voysemble',
    description: en.meta.description,
    path: '/',
    ogTitle: en.meta.ogTitle,
    ogDescription: en.meta.ogDescription,
  })}
  <body>
    ${header(en, false)}
    <main id="main" class="legal">
      <div class="wrap wrap--narrow">
        <h1 class="display">Page not found</h1>
        <p class="lead">The address is not on voysemble.com. <a href="/">Back to the start</a>.</p>
        <p class="lead" lang="ko">${esc('페이지를 찾을 수 없습니다.')} <a href="/ko/">${esc(ko.legal.backHome)}</a></p>
      </div>
    </main>
    ${footer(en, ctx)}
  </body>
</html>
`;
}

export function renderSitemap(ctx: RenderContext): string {
  const paths: ('/' | '/privacy/' | '/terms/')[] = ['/', '/privacy/', '/terms/'];
  const urls = LOCALES.flatMap((l) =>
    paths.map((p) => {
      const alternates = LOCALES.map(
        (al) => `<xhtml:link rel="alternate" hreflang="${al}" href="${esc(pageUrl(ctx, al, p))}"/>`,
      ).join('');
      return `<url><loc>${esc(pageUrl(ctx, l, p))}</loc>${alternates}<lastmod>${esc(ctx.updated)}</lastmod></url>`;
    }),
  );
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls.join('\n')}
</urlset>
`;
}

export function renderRobots(ctx: RenderContext): string {
  return `User-agent: *\nAllow: /\nSitemap: ${ctx.siteUrl}/sitemap.xml\n`;
}
