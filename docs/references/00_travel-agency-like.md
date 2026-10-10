# Travel — design & build specification

Status: agreed design (owner interview, 15 decisions), ready to build.
Audience: an engineer or coding agent building the Travel app in a separate project.
Scope: a professional travel-agency operations tool with live tracking, run by **one owner**, handling **highly
sensitive client data**. Everything below is a requirement unless marked *later* or *option*.

---

## 0. Security principles (non-negotiable)

1. **Minimum exposed surface, everything else end-to-end encrypted.** The server stores ciphertext for all trip
   content. Plaintext on the server is limited to what §6 (watch list) explicitly lists.
2. **One person holds private documents: the owner.** No staff accounts. Travellers, guides, drivers and venues
   get *data slices* through sealed links, never documents (passport/visa scans, e-tickets, vouchers, confirmation
   numbers, invoices, ledger).
3. **No card data, ever** (no PAN, no CVV, not even masked card numbers in free text: strip on ingest).
4. **AI runs on the device** (WebGPU) by default. Cloud AI only per item, on explicit request, and only on the
   owner's own Cloudflare account (Workers AI). No third-party AI services.
5. **Auth is never weakened**, not even in development (Cloudflare Access in front of the app; vault unlock for keys).
6. **Never delete silently.** Retention prompts the owner; deletion is an owner action.
7. **Everything external is untrusted input**: emails, PDFs, spreadsheets, feed responses, link-page submissions.
   Parsers are bounded (size, time, depth) and fuzzed.
8. Secrets (API keys) live only in Worker secrets; never in the repository, never sent to the browser.

---

## 1. Host platform assumptions

Built on (or equivalent to):

- **Cloudflare Workers + Hono** (API), **React Router v7** (app), **Durable Objects with SQLite** (per-owner state,
  alarms, WebSockets), **R2** (sealed blobs), **Workers AI** (optional cloud AI), **Web Push (RFC 8291)**.
- A **vault**: client-side key hierarchy unlocked on the device (password/Argon2id or device key), from which
  per-object content keys are wrapped. If the target project lacks one, build: a vault master key → per-trip
  content keys (AES-256-GCM), wrapped with the vault key; AAD binds every ciphertext to (owner, object type, object
  id, version).
- **Contacts**, **Calendar**, **Tasks**, **Home**, **Files**, **Money** apps exist alongside (integration points
  are named below; in a standalone project, replace with exports).
- An on-device text model (e.g. Qwen3 0.6B/1.7B via transformers.js + ONNX Runtime WebGPU) with pinned,
  self-hosted weights (served from the owner's own storage, SHA-256 verified).

---

## 2. Decisions (interview record)

| # | Topic | Decision |
|---|---|---|
| Q1 | What it is | Agency tool for **client trips**; the owner can also be a traveller. **Trip** is the central record; travellers come from Contacts (or are trip-only, Q11). |
| Q2 | Booking | **Manage bookings made elsewhere**; no booking engine. Ingest from confirmation emails/PDFs. GDS booking possible *later* on the same model. No card data, ever. |
| Q3 | Live sources | Flights, trains (per-country adapters), ferries (AIS), weather, advisories, FX, hotel/car changes from emails, client location (opt-in, ends with the trip). Regions: **mostly Korea, Japan, Europe.** |
| Q4 | Client-facing | **Sealed live trip page** per traveller/family (key in URL fragment, expiry, revoke); **PDF itinerary in KO/JA/EN**; notifications **email + Web Push** in v1, **Kakao 알림톡 and WhatsApp later**. |
| Q5 | Users | **Single owner.** Each trip sealed with its own content key, wrapped to the vault. |
| Q6 | Traveller data | Traveller details + optional passport scans, sealed. On-device checks: passport validity, K-ETA, ETIAS, UK ETA, ESTA, EES awareness, name match, minors. Client page shows only "valid ✓". **Retention prompt after 60 months without a trip**, never silent deletion. |
| Q7 | Money | Per-trip **ledger**: quotes, client deposit and balance schedule, supplier payables; deadlines (ticketing time limits, prepayments, cancellation windows) as reminders on Home and in Tasks; commission and margin; multi-currency (ECB rate or actual rate paid); quote/invoice/refund PDFs; totals to Money. **No Korean tax e-invoicing.** Per line: **hidden markup** or **visible service fee**; default in Travel settings. |
| Q8 | Ingest | Order: booking markup (schema.org) → **known-sender templates (airlines and hotels booked direct first)** → on-device AI. Cloud AI only per email on request. **Always a suggestion with one-click confirm; never filed silently.** Sources: inbox emails, forwarded emails, PDFs dropped onto a trip. |
| Q9 | Daily view | **Now board** (next 48 h, all trips, live, red/amber pinned with suggested actions) + **pipeline** (Inquiry → Quoted → Confirmed → Travelling → Completed; Cancelled) + segments in a sealed **"Travel" calendar**. Alert rules in §8. |
| Q10 | Watching while devices sleep | **B+**: minimal plaintext **watch list** on the server (flight/train facts only) + **sealed per-segment labels** that only the owner's devices' notification handlers can open (detailed lock-screen notifications, setting from "Red alert" to full details). Email alerts stay generic. |
| Q11 | Trip shape | **Segments per traveller** (split/join), rooms, group bookings, plus **group-tour operations**: sub-groups/coaches, allotments with release, guide/driver schedules, coach tracking (driver opt-in), meal plan + dietary, coach seating. Sizes vary, **up to 120+** (3–4 coaches). XLSX/CSV traveller import; group travellers are trip-only unless promoted to Contacts. |
| Q12 | Outside people | **Sealed role links**: guide (own coach: schedule, pax list, headcount, issue report), driver (pickups, times, counts, **no names**, location only while on duty), venue (counts + dietary). Expire with the trip; revocable. |
| Q13 | Offline | **72 h window**: owner's devices keep active/upcoming trips sealed offline (vouchers, contacts, terms); link pages keep their own slice; offline actions queue with their real time. Passports offline only by per-trip opt-in, owner's device only. Purged on completion. |
| Q14 | Access | **Owner only** holds private documents (online and offline). Travellers: itinerary + live status + "valid ✓", no documents. Guides/drivers/venues: Q12 slices, no documents. |
| Q15 | Build order | **1 → 3 → 2 → 4** (trips + live core, then group operations, then money + client pages, then wider live data). |

---

## 3. Domain model (all sealed unless stated)

Every record below lives inside a trip's sealed state (one trip content key per trip). Server sees only
`trip_id`, `version`, sizes, timestamps, and the wrapped trip key.

**Trip**
- id, title, status (`inquiry | quoted | confirmed | travelling | completed | cancelled`), start/end (derived from
  segments), client (Contact ref or trip-only traveller), notes, tags.
- Status auto-transitions: `confirmed → travelling` at the first segment's start; `travelling → completed` 24 h
  after the last segment ends. Manual override allowed.

**Traveller** (per trip; optional link to a Contact)
- Names exactly as in passport (surname, given names), date of birth, sex (as in passport), nationality, passport
  number/issuing country/issue/expiry, other travel documents (visa, K-ETA, UK ETA, ESTA, ETIAS; number +
  validity), dietary needs, medical notes (free text, sealed), emergency contact, consents (location sharing,
  messaging channel), minor flag + guardian refs, sub-group, room.
- Passport/visa scans are **files** (sealed, per-traveller folder), referenced by id.
- Contacts integration: a "Traveller" section on a Contact holds the reusable passport/document data; trip-only
  travellers stay inside the trip.

**Segment** (the unit of tracking)
- type: `flight | train | ferry | coach | transfer | hotel | car | activity | meal | other`
- travellers: subset (default all), sub-group(s)
- times with IANA time zones (scheduled, estimated, actual); places (IATA airport, UIC/station id, port UN/LOCODE,
  address + coordinates)
- operator, number (flight `KE907`, train `ICE 123` / ODPT train id, vessel name + MMSI), cabin/class, seat(s)
- booking refs (PNR, hotel confirmation, ticket numbers) — owner-only
- status (`scheduled | delayed | gate_change | cancelled | departed | arrived | checked_in | done`), source
  (email id / PDF file id / manual), `watch_id` (if watched), `next_segment` + minimum connection time (MCT)
- hotel: property, room types, nights, board, check-in/out, cancellation terms; car: supplier, pickup/return.

**Booking** — groups segments sharing a reference (incl. group fares for N travellers; name-list deadlines).

**Sub-group / coach** — label (A/B/C), vehicle, driver link, guide link, assigned travellers, seat map.

**Room** — hotel segment ref, room type, occupants.

**Allotment** — supplier, room/seat type, count per night/date, **release schedule** (e.g. 30/14/7 days), current
pickup; each release date is a deadline.

**Meal plan** — per day/venue: counts, dietary breakdown.

**Ledger** (owner-only)
- Lines: description, segment/booking ref, supplier cost (currency, amount), client price, pricing mode (`markup`
  hidden | `service_fee` visible), commission receivable (rate/amount), FX rate used (ECB date or actual).
- Client payment schedule (deposit, balance; due dates), payments received; supplier payables (due dates, paid).
- Derived: trip revenue, cost, margin, commission, outstanding (in a base currency, KRW default).

**Deadline** — kind (`ticketing_time_limit | deposit_due | balance_due | prepayment | cancellation_window |
allotment_release | name_deadline | document_expiry | custom`), due at, segment/booking ref, state. Mirrored to
Home and Tasks as sealed reminders.

**Role link** — role (`traveller | family | guide | driver | venue`), scope (trip, sub-group, segments), expiry
(default: trip end + 24 h), revoked flag, link key (never stored server-side), last opened.

**Alert** — severity, rule, segment ref, created, acknowledged, actions taken.

---

## 4. Cryptography

### 4.1 Trip storage
- Per-trip **content key** (AES-256-GCM), random; wrapped with the vault key; stored beside the trip.
- Trip state stored as one or more sealed blobs (e.g. `core`, `ledger`, `docs-index`), each with AAD
  `travel:v1:<owner>:<trip_id>:<part>:<version>`. Optimistic concurrency by version.
- Large files (scans, vouchers, PDFs) stored as sealed objects (per-file content key wrapped by the trip key).
- The device builds a local **sealed index** (IndexedDB, key derived via HKDF from a vault secret) for search and
  the Now board snapshot; nothing searchable is stored server-side.

### 4.2 Server watch list (the only plaintext; §6)
- Created/updated by the owner's device when a segment is confirmed; deleted at segment end + 24 h (alarm).

### 4.3 Sealed notification labels (B+)
- **Notify key**: a symmetric key (AES-256-GCM) created on the owner's first device, distributed to the owner's
  other devices wrapped by the vault, and stored **non-extractable** in the service worker's IndexedDB.
- Per watched segment, the device writes a **label** (e.g. "Kim family (3) · KE907 ICN→LHR → Eurostar 15:31")
  sealed with the notify key (AAD binds `watch_id`). Server stores it opaque.
- On an event, the server sends a Web Push (RFC 8291, fresh ephemeral key per message) containing
  `{watch_id, alert_kind, severity, sealed_label, facts}`. The service worker decrypts the label and renders per
  the **lock-screen detail** setting: `generic` ("Travel: 1 red alert") | `segment` ("KE907 cancelled") | `full`.
- Email alerts are always generic ("Travel: N red alerts").

### 4.4 Role links (traveller, guide, driver, venue)
- Link URL: `/t/<link_id>#k=<base64url 256-bit key>`. The fragment never reaches the server.
- The owner's device builds the **slice** for that role (§9) and seals it with the link key; server stores
  `{link_id, sealed_slice, expires_at, revoked}`; re-sealed by the owner's device whenever the trip changes.
- **Ops channel key** per sub-group (in guide and driver slices, and the owner's trip state) for live traffic:
  driver positions, headcounts, issue reports. Clients seal with it; the server relays and stores ciphertext only
  (DO WebSocket + short retention, e.g. latest position only, events until trip end + 24 h).
- Client location sharing (opt-in) uses the same pattern with a per-traveller channel key.
- Revoke = server deletes the slice and channel data immediately; the owner rotates the ops key for the remaining
  links. Expiry = alarm deletes everything.
- Link pages: strict CSP, no third-party scripts, `Referrer-Policy: no-referrer`, `noindex`, no analytics.

### 4.5 Offline
- Owner devices: sealed cache of trips with status `travelling` or starting within 72 h; key derived from the
  vault; opening requires the vault unlocked. Purged on trip completion. Passport scans only with per-trip opt-in.
- Link pages: the sealed slice cached by the page's service worker until expiry; opened only with the fragment key.
- Offline actions queue (sealed) with the time they happened; replayed in order on reconnect; conflicts resolved
  by time with the owner's edits winning.

---

## 5. Ingest (emails, forwards, PDFs)

Runs on the owner's device. Output is always a **suggestion card** ("Attach to Park trip? 3 segments found")
with one-click confirm, edit, or dismiss. Never filed silently.

Pipeline (first match wins, later stages fill gaps):
1. **Booking markup**: schema.org `FlightReservation`, `LodgingReservation`, `TrainReservation`,
   `BusReservation`, `RentalCarReservation`, `EventReservation` (JSON-LD and microdata) in the email HTML.
2. **Known-sender templates**, first targets (direct bookings):
   - Airlines: Korean Air, Asiana, Jeju Air, JAL, ANA, Peach.
   - Hotels: major chains' direct confirmation emails (e.g. Marriott, Hilton, IHG, Accor, Hyatt, Lotte, Shilla,
     Toyoko Inn, APA), extend as samples arrive.
   - Templates are data-driven (sender domain + DKIM pass + structure match), versioned, with fixture tests.
3. **On-device AI** (Qwen3 0.6B/1.7B, WebGPU) with a strict JSON schema; output validated and shown as a
   suggestion with lower confidence styling.
4. **Workers AI** only when the owner clicks "Read with cloud AI" for that one email.

Rules: require DKIM/SPF alignment for template matches (spoofed "airline" emails → no template, shown as
unverified); strip card numbers; detect **change/cancellation** emails and map to existing segments (status
change suggestion + alert). PDFs: on-device text extraction (+ OCR if image-only). XLSX/CSV traveller import:
on-device parser with column mapping, preview, validation (dates, passport formats), duplicates check.

---

## 6. Live data

### 6.1 Server watch list (plaintext, minimal)

| Stored (until segment end + 24 h) | Never stored server-side |
|---|---|
| kind; carrier + number or train id or vessel MMSI; service date; origin/destination codes; scheduled times; link to next watch item + MCT; alert thresholds; sealed label (opaque) | names, booking refs, ticket numbers, hotel names, client contacts, prices, passport data, trip titles, notes |

Watcher: a Durable Object per owner with alarms.
- Cadence (flights, fallback when the provider has no push alerts): every 30 min from T-24 h, every 5 min from
  T-3 h through arrival, then stop. Trains: from T-2 h. Ferries: AIS stream subscription during the sailing window.
- Prefer provider push (webhooks/alerts) where available; keep polling as a fallback.
- Connection risk computed server-side from linked items: `next.departure - this.arrival_estimated < MCT` → red.

### 6.2 Sources (commercial licensing matters: this is an agency)

| Domain | Source | Key | Notes |
|---|---|---|---|
| Flight status | **Adapter**: FlightAware AeroAPI **Standard** ($100/mo min; alerts included) *or* AeroDataBox (cheap, webhooks) *or* Cirium | yes | AeroAPI Personal tier is personal/academic only — not for agency use. |
| Flight position/track | **Flightradar24 API Essential** ($90/mo) | yes | Replaces OpenSky (non-commercial license). |
| Trains — Japan | ODPT (Public Transportation Open Data) | yes (free) | Real-time where operators publish; JR coverage varies by operator. |
| Trains — Germany | DB API Marketplace (Timetables / changes) | yes (free) | |
| Trains — France | SNCF API (Navitia) | yes (free tier) | Disruptions included. |
| Trains — Austria | ÖBB (no official public real-time API) | — | Best effort or "not live". |
| Trains — Italy | Trenitalia (no official public API) | — | "Not live" unless a licensed source is added. |
| Trains — Korea | KTX/SRT: no live feed | — | Always shown as "not live". |
| Ferries | aisstream.io (AIS WebSocket) | yes (free) | Vessel by MMSI. |
| Weather | METAR (aviation weather), Open-Meteo **commercial plan** or national weather services | varies | Open-Meteo free tier is non-commercial. |
| Advisories | Korea MOFA 해외안전여행 open data (data.go.kr), Japan MOFA 海外安全情報 open data, EU member states' official advisories (e.g. UK FCDO content API, German Auswärtiges Amt open data) | some | Normalised to 4 levels. |
| Strikes | SNCF/DB disruption feeds; others via ingested emails | — | No universal feed. |
| FX | ECB daily reference rates | no | KRW, JPY, EUR, GBP, CHF, … |

All provider calls go through the Worker (keys stay server-side); responses are validated and size-bounded.

---

## 7. Document checks (on device)

Rules are **data** (versioned table with effective dates and source URLs), editable by the owner, shown with
"last verified" dates. Initial rules:
- Passport validity: Schengen (≥ 3 months beyond departure, issued < 10 years), UK, Japan, Korea, US; airline
  6-month common rule as a warning.
- Entry authorisations by nationality × destination: **K-ETA** (Korea), **ETIAS** (Schengen, once in force),
  **UK ETA**, **ESTA** (US); **EES** awareness (extra border time → longer MCT on first Schengen entry).
- **Name match**: booking name vs passport (MRZ-style surname/given comparison, transliteration-aware for KO/JA).
- **Minors**: travelling without both parents → consent-letter checklist.
- Batch summary for groups ("117 valid ✓ · 2 expire within 6 months · 1 K-ETA missing").
- Client page shows only "valid ✓" / "action needed (contact your agent)".

---

## 8. Alerts

| Severity | Triggers (defaults; editable) | Delivery |
|---|---|---|
| Red | cancellation (feed or email); connection at risk (margin < MCT); delay ≥ 3 h; advisory raised to "leave/do not travel" where a client is; ticketing time limit < 24 h and unticketed; headcount short at departure time | Web Push + generic email; **breaks quiet hours while a traveller is in motion** |
| Amber | delay 30 min–3 h; gate/terminal change; schedule-change email; advisory up one level; strike notice; payment/cancellation-window/allotment-release deadline < 72 h | board + morning digest |
| Info | departed, landed, checked in, on time | board only |

Quiet hours default 23:00–07:00 (owner's time zone). Red alerts carry **suggested actions**: open the booking,
draft a client message (KO/JA/EN, on-device AI, owner edits before sending), EU261 compensation note when
applicable. Red/amber mirror to Home and Tasks.

---

## 9. Access matrix

● online + offline · ○ online only · – never

| Data | Owner | Guide link | Driver link | Venue link | Traveller page |
|---|---|---|---|---|---|
| Itinerary (times, places) | ● | ● own coach | ● pickups only | ● their booking | ● own segments |
| E-tickets, vouchers, confirmation numbers | ● | – | – | – | – |
| Passport/visa scans | ● opt-in per trip, else ○ | – | – | – | – ("valid ✓" only) |
| Pax list (names, ages, rooms) | ● | ● own coach | – (counts only) | – (counts only) | – |
| Dietary/medical | ● | ● own coach | – | dietary counts only | ● own |
| Ledger, prices, margins | ● | – | – | – | – |
| Live status | ● | ● | ● | – | ● |
| Traveller location (opt-in) | ○ | ○ own coach | – | – | – |
| Coach position (driver opt-in, on duty) | ○ | ○ | ● own | – | ○ own coach |

Traveller tickets reach travellers from the operator's own email/wallet; the app does not distribute documents.

---

## 10. UI

- **Travel tab**: Now board (default) · Pipeline · Trips list · Deadlines · Settings.
- **Now board**: next 48 h movements across trips, time-sorted; red/amber pinned with actions; per sub-group
  headcount chips ("A 44/44 · B 41/42"); offline badge when served from the sealed snapshot.
- **Trip page**: timeline by day with per-traveller filter; travellers table (import, checks); rooming table
  (drag between rooms); sub-groups/coaches with seat map; allotments; meal plan; documents; ledger (Phase 2);
  links (create/expire/revoke, last opened); per-trip map (segments + live positions).
- **Suggestion inbox**: ingest cards awaiting confirmation.
- **Settings**: pricing default (markup vs service fee), base currency, alert thresholds, quiet hours, lock-screen
  detail, retention period (60 months), providers/keys status (server-side), languages for PDFs.
- PDFs (KO/JA/EN): itinerary, quote, invoice, refund, rooming list, manifest (exports sealed until saved; warn on
  export that the file leaves the vault).
- Mobile-first for link pages (guide/driver use phones); desktop-first for the owner's board.

---

## 11. Build phases (order agreed: 1 → 3 → 2 → 4)

**Phase 1 — Trips + live core**
- Trip model, sealing, versioning, pipeline + auto status; travellers (Contacts + trip-only, XLSX/CSV import);
  segments per traveller; ingest pipeline (§5) with suggestion cards; document checks (§7); Now board; sealed
  Travel calendar; flight live status + positions via adapters; watch list + B+ notifications (Web Push, generic
  email); 72 h offline cache; retention prompt.
- Accept when: a family trip ingested from KE + hotel emails shows on the board; a simulated cancellation at 03:10
  produces a detailed lock-screen notification while the server never held a name; offline mode shows the next
  72 h with the network off.

**Phase 3 — Group operations**
- Sub-groups/coaches, rooming table, allotments + release deadlines, meal plan + dietary, coach seating; guide,
  driver, venue links; ops channel (headcount, issue reports, driver location on duty); batch document checks;
  exports (rooming list, manifest).
- Accept when: a 120-traveller trip with 3 coaches runs end to end; each guide sees only their coach; the driver
  page contains no names; revoking a link removes its data server-side at once; headcount taken offline syncs
  with its original time.

**Phase 2 — Money + client pages**
- Ledger (markup/service fee, commission, margin, multi-currency, ECB), payment schedules, payables, deadlines to
  Home/Tasks; quote/invoice/refund/itinerary PDFs (KO/JA/EN); totals to Money; traveller/family pages with live
  status.
- Accept when: a quote → deposit → balance → refund cycle reconciles to the cent across KRW/JPY/EUR; the client
  page shows no price except the client's own invoice total and no documents.

**Phase 4 — Wider live data + channels**
- Trains (ODPT, DB, SNCF; ÖBB/Trenitalia best effort; KTX/SRT "not live"), ferries (AIS), advisories (KR/JP/EU),
  strike/disruption feeds, weather; Kakao 알림톡 and WhatsApp (templates; content generic or sealed-link only).

---

## 12. Testing & hardening

- Unit: ingest templates (fixture emails per sender, incl. change/cancel variants and spoofed senders), schema.org
  extraction, XLSX/CSV import, document-check rules, MCT/connection risk, alert rule engine, ledger math (FX,
  rounding), status transitions, retention.
- Crypto: AAD binding (swap/replay rejected), link key never sent (inspect requests), revoke/expiry deletion,
  notify-key distribution and non-extractability, offline cache purge.
- API: watch list contains only the allowed fields (schema-enforced; reject extra fields); per-owner isolation.
- E2E (headless browser): board, ingest confirm, offline window, link pages per role, push rendering by the
  service worker (detail levels), stand-in providers (flight, positions, trains, AIS) behind env-configurable
  base URLs.
- Fuzz: email HTML/MIME, PDF text, XLSX/CSV, provider JSON, link-page submissions.
- Pages: strict CSP with nonces, Trusted Types, no third-party scripts, no-referrer, noindex on link pages.

---

## 13. Non-goals (v1)

Booking engine / GDS; card data; Korean tax e-invoicing; staff accounts (future: wrap trip keys per staff member);
a live "map wall" of all travellers; distributing travel documents to travellers.

---

## 14. Open items for the implementer

1. Final flight provider choice and contract (AeroAPI Standard vs AeroDataBox; FR24 Essential for positions);
   verify current prices and terms at sign-up.
2. Keys to obtain: ODPT, aisstream.io, DB API Marketplace, SNCF/Navitia, data.go.kr (advisories), weather plan.
3. Confirm entry-rule dates (ETIAS start, K-ETA exemptions, UK ETA scope) and record sources in the rules table.
4. Template samples: collect real confirmation emails (owner's own) for each first-target sender; redact before
   using as fixtures.