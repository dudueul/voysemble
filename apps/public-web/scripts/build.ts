// Copyright 2026- At Day. All rights reserved.
//
// Build the public site into dist/: render every page from the content model, prepend the design
// tokens to the stylesheet, copy the console captures the pages reference, and hash every asset
// file name so the edge can cache them forever. Run with `node scripts/build.ts` (Node 22.18+
// strips types natively; no bundler is involved).
//
// Environment:
//   SITE_URL            canonical origin for hreflang, Open Graph and the sitemap (default
//                       https://voysemble.com; previews pass https://www.<build>.dev.voysemble.cfd)
//   BUILD_ID            stamped into the generator meta and the footer (default local)
//   CF_ANALYTICS_TOKEN  Cloudflare Web Analytics site token; omitted means no beacon at all

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { en } from '../src/site/en.ts';
import { ko } from '../src/site/ko.ts';
import { type CaptureName, type PhoneShot, SITE, type SiteContent } from '../src/site/model.ts';
import {
  type RenderContext,
  renderLanding,
  renderLegalPage,
  renderNotFound,
  renderRobots,
  renderSitemap,
} from '../src/site/render.ts';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const repo = resolve(root, '..', '..');
const dist = join(root, 'dist');
const capturesDir = join(repo, 'docs', 'captures', 'web', 'desktop-1440');
const tokensCss = join(repo, 'packages', 'design-tokens', 'dist', 'tokens.css');

/** Every capture the content references, collected from both locales (they must match). */
export function capturesUsed(contents: SiteContent[]): CaptureName[] {
  const names = new Set<CaptureName>(['command-center']);
  for (const c of contents) {
    for (const g of c.phases.groups)
      for (const f of g.features) if (f.capture) names.add(f.capture.file);
  }
  return [...names].sort();
}

/** Every phone capture the gallery shows (both locales show the same ones). */
export function phoneShotsUsed(contents: SiteContent[]): PhoneShot[] {
  const seen = new Map<string, PhoneShot>();
  for (const c of contents)
    for (const shot of c.phones.shots) seen.set(`${shot.platform}/${shot.file}`, shot);
  return [...seen.values()];
}

function hashOf(buf: Buffer | string): string {
  return createHash('sha256').update(buf).digest('hex').slice(0, 8);
}

function write(path: string, content: string | Buffer): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

export function build(): { pages: string[]; assets: string[] } {
  const siteUrl = (process.env.SITE_URL ?? SITE.siteUrl).replace(/\/$/, '');
  const buildId = process.env.BUILD_ID ?? 'local';
  const analyticsToken = process.env.CF_ANALYTICS_TOKEN?.trim() || null;
  const updated = new Date().toISOString().slice(0, 10);

  rmSync(dist, { recursive: true, force: true });
  mkdirSync(dist, { recursive: true });
  const assets: string[] = [];

  // Stylesheet: tokens first, then the site styles; one hashed file.
  const css = `${readFileSync(tokensCss, 'utf8')}\n${readFileSync(join(root, 'src/styles/site.css'), 'utf8')}`;
  const cssHref = `/assets/site.${hashOf(css)}.css`;
  write(join(dist, cssHref), css);
  assets.push(cssHref);

  const js = readFileSync(join(root, 'src/client/site.js'), 'utf8');
  const jsHref = `/assets/site.${hashOf(js)}.js`;
  write(join(dist, jsHref), js);
  assets.push(jsHref);

  // Captures: real console screenshots from the Playwright runs, hashed by content.
  const images = {} as Record<CaptureName | 'og', string>;
  for (const name of capturesUsed([en, ko])) {
    const src = join(capturesDir, `${name}.png`);
    if (!existsSync(src)) throw new Error(`capture missing: ${src}`);
    const buf = readFileSync(src);
    const href = `/img/${name}.${hashOf(buf)}.png`;
    write(join(dist, href), buf);
    images[name] = href;
    assets.push(href);
  }
  // Phone captures (slice 040): the apps' own test runs, from docs/captures/ios and /android.
  const phoneImages: Record<string, string> = {};
  for (const shot of phoneShotsUsed([en, ko])) {
    const src = join(repo, 'docs', 'captures', shot.platform, `${shot.file}.png`);
    if (!existsSync(src)) throw new Error(`phone capture missing: ${src}`);
    const buf = readFileSync(src);
    const href = `/img/${shot.platform}-${shot.file}.${hashOf(buf)}.png`;
    write(join(dist, href), buf);
    phoneImages[`${shot.platform}/${shot.file}`] = href;
    assets.push(href);
  }
  // Open Graph card: the committed 1200x630 card (scripts/og-card.ts); the hero capture otherwise.
  const ogSrc = join(root, 'src/assets/og.png');
  if (existsSync(ogSrc)) {
    const buf = readFileSync(ogSrc);
    images.og = `/img/og.${hashOf(buf)}.png`;
    write(join(dist, images.og), buf);
    assets.push(images.og);
  } else {
    images.og = images['command-center'];
  }

  const ctx: RenderContext = {
    siteUrl,
    cssHref,
    jsHref,
    images,
    phoneImages,
    analyticsToken,
    buildId,
    updated,
  };
  const pages: string[] = [];
  const page = (path: string, html: string) => {
    write(join(dist, path), html);
    pages.push(path);
  };
  page('index.html', renderLanding(en, ctx));
  page('ko/index.html', renderLanding(ko, ctx));
  page('privacy/index.html', renderLegalPage(en, 'privacy', ctx));
  page('terms/index.html', renderLegalPage(en, 'terms', ctx));
  page('ko/privacy/index.html', renderLegalPage(ko, 'privacy', ctx));
  page('ko/terms/index.html', renderLegalPage(ko, 'terms', ctx));
  page('404.html', renderNotFound(en, ko, ctx));
  page('sitemap.xml', renderSitemap(ctx));
  page('robots.txt', renderRobots(ctx));
  // Headers for the edge: immutable hashed assets, short HTML cache (Workers static assets honour _headers).
  page(
    '_headers',
    [
      '/assets/*',
      '  Cache-Control: public, max-age=31536000, immutable',
      '/img/*',
      '  Cache-Control: public, max-age=31536000, immutable',
      '/*',
      '  X-Content-Type-Options: nosniff',
      '  X-Frame-Options: SAMEORIGIN',
      '  Referrer-Policy: strict-origin-when-cross-origin',
      '',
    ].join('\n'),
  );
  return { pages, assets };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = build();
  console.log(
    `public-web: ${result.pages.length} pages, ${result.assets.length} assets -> ${dist}`,
  );
}
