// Copyright 2026- At Day. All rights reserved.
//
// Render the Open Graph card (1200x630) with the installed Chromium and write it to
// src/assets/og.png. Run `pnpm og` after changing the hero copy; the PNG is committed because the
// build must not depend on a browser. The card uses the English headline and the brand mark.

import { writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { en } from '../src/site/en.ts';
import { esc } from '../src/site/render.ts';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '..', 'src', 'assets', 'og.png');

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  body { margin: 0; width: 1200px; height: 630px; font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans KR", sans-serif; color: #0F172A;
    background: radial-gradient(60% 60% at 85% 10%, #dbeafe 0%, #ffffff 70%); display: flex; flex-direction: column; justify-content: space-between; padding: 64px; box-sizing: border-box; }
  .brand { display: flex; align-items: center; gap: 14px; font-weight: 800; font-size: 34px; }
  h1 { margin: 0; font-size: 64px; line-height: 1.08; letter-spacing: -0.02em; font-weight: 800; max-width: 18ch; }
  p { margin: 0; font-size: 26px; color: #475569; max-width: 40ch; line-height: 1.4; }
  .foot { font-size: 22px; color: #2563EB; font-weight: 700; }
</style></head><body>
  <div class="brand"><svg width="48" height="48" viewBox="0 0 32 32"><path d="M4 7l12 19L28 7" fill="none" stroke="#2563EB" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><circle cx="24" cy="8" r="4" fill="#F59E0B"/></svg>Voysemble</div>
  <div><h1>${esc(en.hero.title)}</h1><p style="margin-top:20px">${esc(en.hero.eyebrow)}</p></div>
  <div class="foot">voysemble.com</div>
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1200, height: 630 },
  deviceScaleFactor: 1,
});
await page.setContent(html);
const png = await page.screenshot({ type: 'png' });
await browser.close();
writeFileSync(out, png);
console.log(`og card -> ${join('src', 'assets', 'og.png')} (${png.length} bytes)`);
