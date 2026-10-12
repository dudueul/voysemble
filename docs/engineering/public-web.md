# Public site (slice 021)

The marketing landing at `voysemble.com` (`www.<build>.dev.voysemble.cfd` for previews, ADR-0008),
an app of its own in `apps/public-web`. It introduces the whole decided product (D12–D29) to
organizers of school and youth group travel, in English at `/` and Korean at `/ko/`, with draft
privacy and terms pages. Decisions D30 (content policy) and D31 (device captures) in
`docs/planning/decision-log.md`. Exercised by `apps/public-web/src/site/render.test.ts` and
`apps/public-web/e2e/landing.spec.ts`.

## Shape

| Piece | Where | Notes |
|---|---|---|
| Content model | `src/site/model.ts` | `SiteContent`: meta, nav, hero, roles, phases (features grouped before / during / after the trip), phone frames, trust, platform, pricing, FAQ, call to action, footer, legal strings. `SITE` holds the constants that are not copy: pilot mailbox, console URL, canonical origin, company. |
| English copy | `src/site/en.ts` | Source language (D11). Each feature carries the decision ids it was written from (`decision`, never rendered) and the roles it serves (`who`, rendered as chips). |
| Korean copy | `src/site/ko.ts` | Same structure; the unit test diffs the two shapes (ids, order, roles, captures, counts) so the pages cannot drift. Role vocabulary as in the product: 주최자, 인솔자, 참가자, 보호자. |
| Legal drafts | `src/site/legal.ts` | Privacy and terms, both languages, from D13, D15, D18, D20, D21, D23, D27, D28, ADR-0001, ADR-0005, ADR-0006. Rendered with the locale's draft notice on top until reviewed. |
| Renderer | `src/site/render.ts` | Pure functions: `renderLanding`, `renderLegalPage`, `renderNotFound`, `renderSitemap`, `renderRobots`. Every content string passes `esc`. Head carries canonical, `hreflang` for en, ko and x-default, Open Graph, Twitter card, theme color, generator with the build id, inline SVG favicon. |
| Styles | `src/styles/site.css` | Prepended at build with `@voysemble/design-tokens` CSS so the page uses the console's palette, radii and type scale. Two breakpoints (1000 px, 720 px). |
| Client script | `src/client/site.js` | The only script: the phone-width menu toggle. FAQ uses `details`, navigation uses anchors, the language switch is a link. |
| Build | `scripts/build.ts` | `node scripts/build.ts` (Node 22.18+ strips types natively; no bundler). Renders the ten files, hashes CSS, JS and images into `assets/` and `img/`, copies the console captures it references from `docs/captures/web/desktop-1440/`, writes `_headers` (immutable assets, nosniff, frame and referrer policies). Env: `SITE_URL`, `BUILD_ID`, `CF_ANALYTICS_TOKEN`. |
| Open Graph card | `scripts/og-card.ts`, `src/assets/og.png` | 1200×630 rendered with the installed Chromium (`pnpm og`), committed so the build needs no browser. |
| Worker config | `wrangler.jsonc` | Assets-only Worker (`voysemble-www`): `auto-trailing-slash`, `404-page`. Routes per ADR-0008 for preview, staging and production; `__BUILD_ID__` substituted by CI. |

Pages: `/`, `/ko/`, `/privacy/`, `/terms/`, `/ko/privacy/`, `/ko/terms/`, `/404.html`,
`/sitemap.xml` (six URLs with `xhtml:link` alternates), `/robots.txt`, `/_headers`.

## Content decisions (from the interview, 2026-10-12)

- Placement: a separate static app, built before the live People page.
- Languages: English at the root, Korean at `/ko/`, header switch, `hreflang`, no auto-redirect.
- Content: the full decided product, thoroughly, with no build-status tags (D30). The console
  and the apps keep the `feature-status.json` honesty rule; the public page describes the
  product as decided.
- Pricing: the per-trip license model in words, "Pilot pricing on request", no figure (D23 has
  the model, not the number). Plans are data; a number is a one-line change.
- Calls to action: "Request a pilot" (`mailto:hello@voysemble.com`, prefilled subject per
  language) as primary, "Open the console" (`https://app.voysemble.com/`) as secondary. Store
  badges wait for the listings.
- Visuals: real console captures (hero: command center; features: roster step, invite codes,
  itinerary with a proposal, communication with acks and the guardian chat, safety with incidents
  and the missing list, media, the live reports, billing, settings) in browser frames, and, since
  slice 040, real phone captures from the apps' own test runs (D31) in device frames: iPhone on
  iOS 26 with Liquid Glass and Android, in English and Korean. Until slice 040 the phones were
  drawn in HTML and CSS from the apps' strings, because no phone captures existed yet.
- Legal: draft privacy and terms in both languages, marked as drafts, linked from the footer,
  at the URLs the store listings will use. Mailboxes named on the pages: `hello@`, `privacy@`,
  `legal@` at voysemble.com; all three need forwarding rules on the founder's side.
- Analytics: Open Graph, sitemap and robots always; the Cloudflare Web Analytics beacon only
  when `CF_ANALYTICS_TOKEN` is set at build; no other script, no cookie.
- Positioning: organizers of school and youth group travel, with the product's role vocabulary;
  one line widens to any organized group with volunteer leaders.

## Sections, in order

Hero (headline, lead, two calls to action, four proof chips, the command center capture) ·
Roles (organizer on the PC console; leader, traveler, guardian on the phone; four bullets each)
· Phones (nine real captures in device frames: Today and the Plan tab on iPhone, the Plan tab and a
head count on Android, Today in Korean, a dark chat thread, the trip switch on Android, the
rooming list and the inbox on iPhone) · Features: before the trip (first run, several trips and
the organizer's own name, roster with its export and fee column, itinerary editor, care notes and
documents with their reminders, sealed links for the driver and the hotel, fees with the export,
settings), on the trip
(Today, the Plan tab, head counts with the console's missing list, announcements, revision
notices, proposals, meeting windows, incidents, photos, chat, disruption replanning,
notifications, lost device), after the trip (live reports, retention, templates) ·
Privacy by design (eight rules) · Platform (six) · Pricing (trip license, fee ledger, seat plans)
· FAQ (ten) · Call to action · Footer (product, legal, language, mailbox).

## Running it

```
pnpm --filter @voysemble/public-web build      # dist/
pnpm --filter @voysemble/public-web test       # vitest: model shape, captures exist, renderers
pnpm --filter @voysemble/public-web test:e2e   # builds, serves with wrangler dev on :8790, four viewports
pnpm --filter @voysemble/public-web dev        # build + wrangler dev
pnpm --filter @voysemble/public-web og         # re-render src/assets/og.png after a hero change
```

## Facts established by tests

- Unit: `en` and `ko` have identical shapes; every referenced capture exists; every feature names
  a decision, a role and details; legal docs have matching section counts; `esc` escapes the five
  characters; the English landing carries canonical, both `hreflang`s and x-default, the Open
  Graph image, the headline, every feature title and FAQ question, both calls to action, no
  beacon without a token and the beacon with one; the Korean landing is `lang="ko"` at `/ko/`
  with a switch back to `/`; legal pages carry the draft notice, the date and every section;
  the 404 is bilingual; the sitemap has six URLs with alternates; robots points at the sitemap.
- Browser (desktop 1440, laptop 1280, tablet 1024, phone 390): `/` is 200 with the title, the
  headline, `lang="en"`, the ko alternate, all seven section ids, every feature with its detail
  count, a decoded hero image wider than 1000 px, the mailto and console hrefs, an FAQ item that
  opens; the language switch reaches `/ko/` with the Korean headline and the Korean head count
  feature title, and back; `/ko` redirects to `/ko/`; the four legal pages are 200 with their
  titles and the draft notice; robots and sitemap are 200; an unknown path is 404 with the 404
  page; responses carry nosniff; on the phone the page has no horizontal overflow, the menu
  opens and closes, and the pricing anchor scrolls into view. Captures:
  `docs/captures/public/<project>/landing-en-top.png`, `landing-ko-top.png`, `privacy-en-top.png`
  (first viewport, four sizes) and `desktop-1440/landing-en.png`, `landing-ko.png` (full page).

## Deploy prerequisites (when a Cloudflare token exists)

`wrangler deploy --env production` from `apps/public-web` after `SITE_URL=https://voysemble.com
BUILD_ID=<sha> pnpm build`; previews pass `SITE_URL=https://www.<build>.dev.voysemble.cfd`.
Custom domains `voysemble.com` and `www.voysemble.com` on the `voysemble-www` Worker. Set
`CF_ANALYTICS_TOKEN` in the CI environment to turn the beacon on. Mail forwarding for `hello@`,
`privacy@`, `legal@`.

## Refreshed with the product (slice 072)

The copy follows the decided and built product: slice 072 added the "Several trips, one console"
feature (D42, the trip switch on the console and the phones, the organizer's own name) with the
`command-center-trips` capture, and brought the roster (export, fee column), documents (the
reminder mornings), sealed links (the driver's names, the hotel's rooming list, D39/D41), fees
(the export), Today (the packing card and the inbox), incidents (a card by hand), chat
(moderation, the audited read, the reader's language), disruption (the edge model, the journey
graph) and notifications (packing reminders, the email digest) up to date in both languages; the
phone gallery gained the trip switch, the rooming list and the inbox. `render.test.ts` keeps the
two languages in one structure and every capture on disk.

Slice 077 brought slices 073 to 076 to the site in both languages: the incidents feature
(a leader's card from the phone, the traveler's "I need help", the organizers' email; decisions
D17 and D29), Today (the room tonight, the help card; D41 and D17 added), the sealed links (a
traveler reads their own room and roommates, nothing more), notifications (the organizers'
mailbox); the phone gallery gained the help card on Android, the room card and the leader's
form on iPhone (`today-help`, `today-room`, `incidents-new`).

## Not done

Store badges (no listings yet), a waitlist form (mail is the funnel for the pilot), a public
help center, the reviewed legal wording, Japanese.
