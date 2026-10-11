# Slice ledger

One entry per approved slice. Evidence names commands, exit status, and runtime. "Passed" means it ran.

## Slice 001: monorepo scaffold + API Worker health + OpenAPI + header lint + CI

Status: done 2026-10-10. Commit: see git log (`chore: scaffold ...`).

| Gate | Command | Result |
|---|---|---|
| Lint + format | `pnpm lint` (Biome 2.5.15) | 28 files checked, 0 errors |
| Typecheck | `pnpm typecheck` (tsc 5.9.3, `wrangler types` generated bindings) | contracts + api-worker pass, test tsconfig pass |
| Worker tests | `pnpm --filter @voysemble/api-worker test` (vitest 4.1.11 inside workerd via `@cloudflare/vitest-plugin` 1.4.0) | 3 files, 5 tests passed |
| Script tests | `pnpm test:scripts`, `pnpm --filter @voysemble/design-tokens test` (node:test) | 6 + 4 passed |
| Header lint | `pnpm check:headers` | ok on all tracked files |

Facts established by tests:
- `GET /v1/health` returns 200 and a body that parses with `HealthResponse`; `envName=local`, `buildId=local`.
- `X-Correlation-Id` is generated when absent and preserved when well-formed.
- `/openapi.json` is OpenAPI 3.1 and lists `/v1/health`, `HealthResponse`, `ErrorEnvelope`.
- Unknown routes return the `ErrorEnvelope` with `NOT_FOUND` and the correlation id inside.
- `X-Content-Type-Options: nosniff` and `X-Frame-Options: SAMEORIGIN` on every response.
- Header lint accepts shebang-first files, CSS block form; exempts JSON, markdown, lockfile, generated types, reference docs.
- Token generator resolves references, throws on unresolved, emits header + ARGB literals for Kotlin/Swift.

Deviations found while building:
- `@cloudflare/vitest-pool-workers` is deprecated; replaced by `@cloudflare/vitest-plugin` (Vite plugin `cloudflareTest`). Docs in refs predate this.
- Biome 2.5 uses `rules.preset` not `rules.recommended`.
- pnpm 10 blocks postinstall scripts; `onlyBuiltDependencies: [esbuild, workerd]` in `pnpm-workspace.yaml`.
- `@types/node` required once `nodejs_compat` is on.

Not done (next slices): no DB, no auth, no mobile code, no web app, no deploy. CI workflow is committed but unverified until pushed.

## Slice 002: KMP core skeleton + Compose shell + Xcode project skeleton

Status: done 2026-10-10 with two unverified parts (below). Commit: `feat(mobile): ...`.

| Gate | Command | Result |
|---|---|---|
| Core JVM tests | `cd mobile && ./gradlew :core:jvmTest -Pvoysemble.android=false` (Gradle 9.6.0, Kotlin 2.4.20, JDK 21) | 2 classes, 5 tests passed |
| Web gate | `pnpm check` | lint 0 errors, typecheck pass, 5 worker tests, 10 script tests, headers ok (now covering .kt/.kts/.swift/.toml/.properties/.yml) |
| Android build | `./gradlew build` | **not run here**: `dl.google.com` denied by sandbox network policy (no Android SDK, no Google Maven). Runs in CI `mobile` job on GitHub runners |
| iOS build | `xcodegen generate` + Xcode | **not run here**: Linux host. Founder's Mac |

Facts established by tests (core, Ktor MockEngine, no network):
- `ApiClient.health()` hits `https://<host>/v1/health`, sends `X-Correlation-Id`, decodes `HealthResponse`, returns `ApiResult.Ok` with the echoed correlation id.
- An `ErrorEnvelope` body becomes `ApiResult.Failed(status, error)` with code and correlation id preserved.
- A non-envelope error body becomes `ApiResult.Unreachable("non-envelope:<status>")`, never a crash.
- A transport exception becomes `ApiResult.Unreachable`.
- `HealthResponse` decodes the Worker's exact JSON and ignores unknown keys.

Built:
- `mobile/core` KMP module: targets jvm, android (toggle), iosArm64, iosSimulatorArm64; static framework `VoysembleCore`; SKIE for Swift ergonomics; `ApiClient`, `ApiResult`, contract mirrors, `platformName` expect/actual, `DarwinEngineFactory` for Swift.
- `mobile/android-app`: Compose, built-in Kotlin (AGP 9), `VoysembleTheme` from generated tokens, `TodayPlaceholderScreen` + `TodayPlaceholderViewModel` (sealed UI state), unit test for state mapping.
- `mobile/ios-app`: XcodeGen `project.yml`, SwiftUI `TodayPlaceholderView` + `TodayPlaceholderModel` using SKIE `onEnum(of:)`, `AppConfig` host per configuration, XCTest.
- Design tokens now also generate `mobile/core/.../design/Tokens.kt` and `mobile/ios-app/Voysemble/Design/Tokens.swift`.
- CI: new `mobile` job runs `./gradlew build` on ubuntu (Android SDK + Google Maven available there).

Deviations found while building (recorded, all pinned in `mobile/gradle/libs.versions.toml`):
- AGP 9 built-in Kotlin: `org.jetbrains.kotlin.android` must not be applied; KMP + `com.android.library` is disallowed, so core uses `com.android.kotlin.multiplatform.library` with `kotlin { android { } }` DSL (AGP ≥ 8.12).
- KGP 2.4.x supports AGP ≤ 9.3.1 (kotlinlang table) -> AGP 9.3.1, which needs Gradle ≥ 9.5 -> Gradle 9.6.0.
- SKIE 0.10.15 supports Kotlin ≤ 2.4.20 -> Kotlin 2.4.20, not 2.4.21.
- Maven Central rate-limits this sandbox (HTTP 429); builds needed several retries. Not a code issue.
- Ktor 3.6 transitively pulls `kotlinx-datetime 0.8.0-0.6.x-compat`; direct datetime dependency removed until needed.
- `voysemble.android` Gradle property added so hosts without Google Maven can still build and test core.

CI verification (run 38081961280 on `1968f7c`): web job green; mobile job **failed** at configuration of
`:core`: the script plugin `core/android-target.gradle.kts` could not resolve `com.android.*`,
`org.jetbrains.kotlin.*`, or `libs`. Cause: `apply(from = ...)` script plugins see only the root
buildscript classpath and have no generated catalog accessor. Fix-forward (in slice 003's commit):
all Gradle plugins moved to the root buildscript classpath, modules apply plugins by id without a
version, the script plugin reads the catalog via `VersionCatalogsExtension`. Core JVM tests re-run
green locally after the change (5/5). Android compile remains CI-verified only.

## Slice 003: organizer web shell + command center on fixtures

Status: done 2026-10-10. Commit: `feat(web): organizer shell and command center on fixtures`.

| Gate | Command | Result |
|---|---|---|
| Lint + format | `pnpm lint` (60 files) | 0 errors after a11y fixes (semantic `<search>`, `<section>`, decorative SVGs, no `role="meter"` div) |
| Typecheck | `pnpm typecheck` | pass (contracts, api-worker, organizer-web) |
| Component tests | `pnpm --filter @voysemble/organizer-web test` (vitest 4.1.11 + happy-dom + RTL) | 2 files, 8 tests |
| Worker tests | `pnpm --filter @voysemble/api-worker test` | 7 tests incl. Static Assets: `/` and `/billing` serve `index.html`; `/v1/*` stays JSON 404 |
| Browser E2E + captures | `CI=1 pnpm --filter @voysemble/organizer-web test:e2e` (Playwright 1.56.1, Chromium, 1440x960 and 1280x800) | 12 passed; 10 screenshots in `docs/captures/web/` |
| Headers | `pnpm check:headers` | ok |

Facts established:
- Dashboard numbers derive from the fixture: 1 active trip, 38 travelers, 94% acknowledged, 2 open alerts, head count 34/38 with "2 missing" per bus.
- Red (Urgent) alert sorts first; alerts show "22 min ago" style relative time in the trip's zone; times render per explicit time zone (07:12 Rome = 15:12 Seoul).
- `/?state=loading|empty|error|offline` each render the designed state; error shows the correlation reference and Retry calls refetch.
- Sidebar has 12 sections; `Today` carries `aria-current="page"`; other sections render an honest "not built yet" placeholder.
- Production bundle: 415 kB JS (130 kB gzip), 15 kB CSS. Served asset-first by the Worker; Worker `notFound` falls back to `ASSETS` for non-API GETs (re-wrapping the response so middleware can add headers).

Visual acceptance evidence: `docs/captures/web/desktop-1440/command-center.png` vs gallery #23 in
`docs/visual-references/screen-gallery-28-mobile-and-web-console.webp`. Matches: sidebar hierarchy,
org/trip context, welcome header, 4 stat tiles, trip list with status pills, right-rail cards.
Deliberate differences: alerts with suggested actions and head-count meters added (doc 00 §8/§10);
cover art is synthetic gradient until licensed photography exists (doc 01 §15); system font stack
instead of a web font (no third-party requests).

Deviations found while building:
- RTL needs explicit `cleanup` between tests without vitest globals.
- Playwright must run from the package directory (root run picks up Worker tests).
- Hono `secureHeaders` cannot mutate an `ASSETS.fetch` response; re-wrap with `new Response(body, res)`.
- Global Playwright 1.56.1 + preinstalled Chromium 1194 in the sandbox; pinned 1.56.1 to match.

Not done: no auth, no live data, no KO strings, no itinerary editor (slice 004).

CI verification (run 38083039420 on `b3a5ebe`): both jobs **failed**.
- web: `apps/organizer-web/test-results/.last-run.json` (Playwright output) had been committed and
  failed Biome format. Fix: `test-results/` and `playwright-report/` gitignored and removed from the index.
- mobile: the script plugin still could not resolve `com.android.*` / `org.jetbrains.kotlin.*`
  even with the plugins on the root buildscript classpath. Script plugins applied with
  `apply(from = ...)` compile against their own classpath. Fix-forward (slice 004's commit): an
  included build `mobile/build-logic` with precompiled convention plugins `voysemble.kmp`
  (always), `voysemble.kmp-android` and `voysemble.android-app` (compiled only when
  `voysemble.android=true`, sources under `src/android/kotlin`). Modules apply convention plugins
  only. Core JVM tests re-run green locally through the convention plugin (5/5). Android compile
  still CI-verified only.

## Slice 004: PC itinerary editor on fixtures

Status: done 2026-10-10. Commit: `feat(web): itinerary editor on fixtures`.

| Gate | Command | Result |
|---|---|---|
| Lint + format | `pnpm lint` (69 files) | 0 errors |
| Typecheck | `pnpm typecheck` | pass |
| Component + reducer tests | `pnpm --filter @voysemble/organizer-web test` | 4 files, 19 tests |
| Worker tests | `pnpm --filter @voysemble/api-worker test` | 7 tests |
| Browser E2E + captures | `CI=1 pnpm --filter @voysemble/organizer-web test:e2e` | 22 passed; itinerary captures at 1440 and 1280 (`itinerary.png`, `itinerary-draft.png`, `itinerary-{loading,empty,error}.png`) |
| Core JVM (mobile) | `./gradlew :core:jvmTest -Pvoysemble.android=false` via build-logic | 5/5 |
| Headers | `pnpm check:headers` | ok |

Facts established:
- Fixture has 13 days (Dec 28 2026 to Jan 9 2027), Day 1 in Asia/Seoul, others in Europe/Rome; 66 events.
- Reducer: edit marks a draft and leaves the revision untouched; move swaps `order` with the
  neighbour only inside the same day and refuses past the edges; add appends a draft and selects
  it; publish bumps the revision by exactly one and clears drafts; publish with no drafts is a
  no-op; removing a published event leaves a `removed:<id>` tombstone draft.
- View: day rail renders 13 buttons; selecting a day swaps the timeline and updates `?day=`;
  selecting an event opens the form; editing shows "1 unpublished change" and enables Publish;
  publishing shows "Revision 8".
- Reorder uses keyboard-accessible buttons (drag is a later enhancement, never the only way).

Visual acceptance evidence: `docs/captures/web/desktop-1440/itinerary-draft.png` vs gallery #24.
Matches: day list on the left, per-day timeline with times, type icons, places, detail on the right.
Deliberate differences: draft/published state and revision counter are explicit (doc 01 §11.3 /
§13.7); status chips carry words, not color alone.

Not done: no persistence (drafts live in the browser until the API slice); no drag reorder; no
conflict handling against a server revision; no KO strings.

CI verification (run 38083890793 on `154eb89`): web job **green** (lint, typecheck, tests,
Playwright E2E, captures uploaded). mobile job **failed**: `Plugin [id: 'voysemble.android-app']
was not found` although build-logic logged `android=true`. Verified locally with a probe plugin:
precompiled-script discovery ignores a source directory added after `kotlin-dsl` is applied.
Fix-forward (next commit): Android convention plugins moved to a second included build
`mobile/build-logic-android`, included from settings only when `voysemble.android=true`.
Non-Android path re-verified locally (core 5/5). Android compile still CI-verified only.

CI verification (run 38084682337 on `2913a80`): mobile job got through AGP resolution, the
`com.android.kotlin.multiplatform.library` plugin, the `kotlin { android { } }` extension,
namespace and SDK versions. One compile error left in `voysemble.kmp-android.gradle.kts`:
`compilerOptions.configure { }` does not exist on this extension in AGP 9.3.1; replaced by
`compilerOptions.jvmTarget.set(JvmTarget.JVM_21)` (`1da48bd`).

CI verification (run 38085160970 on `1da48bd`): `jvmTarget` also unresolved on that
`compilerOptions`. Removed the explicit setting; the toolchain (21) from `voysemble.kmp` applies.
Ships with slice 005's commit.

## Slice 005: mobile Today screen (Compose + SwiftUI) on fixtures

Status: built 2026-10-10; Android compile and screenshots pending CI. Commit: `feat(mobile): today screen ...`.

| Gate | Command | Result |
|---|---|---|
| Core model tests (shared) | `./gradlew :core:jvmTest -Pvoysemble.android=false` | 3 classes, 10 tests (5 new: up-next rule, ack state machine, head count) |
| Android unit + screenshot tests | CI `mobile` job: `./gradlew build` then `:android-app:recordRoborazziDebug` (Robolectric 4.17 native graphics, Roborazzi 1.76.0, 412x915) | **not run here** (no Android SDK / Google Maven in the sandbox) |
| iOS | SwiftUI `TodayView` compiles only on macOS | **not run here** |
| Web gate | `pnpm check` | green |

Built:
- `core/today/TodayModel.kt`: `TodaySnapshot` with `upNext` / `later` rules on local HH:mm, `AckState`
  UNACKNOWLEDGED -> PENDING (queued locally) -> ACKNOWLEDGED (server confirmation, exposed for the
  sync slice), head-count sums. `core/fixtures/KoreaConcertTourFixture.kt` mirrors the web fixture
  (Day 4, 07:12 Rome).
- Android: `TodayScreen` (header with day + sync, green Up-next card with meeting-point action,
  latest announcement with Acknowledge / "Queued · sends when online" / Acknowledged, head-count
  meters with "n missing" text, later-today rows with status chips, five bottom tabs),
  `TodayViewModel`, `VoysembleTheme` with semantic colors + typography + shapes from tokens,
  `AppIcons` (same stroke paths as the web icon set, no icon library). Placeholder screen removed.
- Android tests: `TodayViewModelTest` (JVM) and `TodayScreenshotTest` (light, dark,
  offline + pending ack) writing to `docs/captures/android/`.
- iOS: `TodayView` + `TodayModel` with the same structure, SF Symbols, SKIE `onEnum(of:)` over
  core enums. Placeholder removed.
- CI: records Android screenshots and uploads `android-captures`; captures are copied into the
  repo from the artifact once CI is green (evidence must come from a real run, doc 01 §18.4).

Facts established by tests (core): up-next = first unfinished event ending at/after now (in-progress
counts); later excludes it; nothing up-next late at night; ack transitions are ordered and
idempotent; totals 34/38.

Unverified until CI: Compose code compiles against BOM 2026.09.00 / Material 3 1.4; Robolectric
+ Roborazzi configuration under AGP 9 built-in Kotlin; SwiftUI against the SKIE-generated API.

CI verification (run 38085806640 on `82cca05`): both convention-plugin builds compile. Failure
moved to `core/build.gradle.kts`: `Plugin with id 'voysemble.kmp-android' not found` because
`apply(plugin = ...)` only sees the classpath, and plugins from an included build enter the
classpath only through a `plugins {}` request. Fix-forward: `build-logic` includes and depends
on `build-logic-android` when `voysemble.android=true`, and `voysemble.kmp` applies
`voysemble.kmp-android` itself; `core` no longer references Android. Non-Android path
re-verified (core 10/10).

CI verification (run 38086641892 on `580b328`): configuration passes for every module. Failure
at task-graph time: KGP's `KotlinNativeBundleBuildService` loaded in two classloaders
(`project-core` and `project-android-app`), "plugin applied to two sibling projects". Fix-forward:
root `build.gradle.kts` requests `id("voysemble.kmp") apply false` so KGP (and AGP through
build-logic-android) load once in the root classloader. Non-Android path re-verified (10/10).

CI verification (run 38087326231 on `dd5adc3`): Gradle configuration and plugin loading fully
pass. First dependency-level failure: every Compose BOM 2026.09.00 / lifecycle 2.11 / core 1.19
artifact "requires compile against version 37 or later"; we pinned `compileSdk` 36.
Fix-forward: `compileSdk` 37 (`targetSdk` stays 36) plus `android.suppressUnsupportedCompileSdk=37`
for AGP 9.3.1 (`55628e4`).

CI verification (run 38087963803 on `55628e4`): **the Android stack compiles**: `core` Android
target, `android-app` debug and release Kotlin (the Compose Today screen), R8 minify, lint
analysis. Only `compileDebugUnitTestKotlin` failed: `kotlin.test.Test` unresolved in
`TodayViewModelTest` (no JUnit bridge for kotlin-test on the Android unit-test classpath).
Fix-forward: `org.junit.Test` in the test and `kotlin("test-junit")` added (`59e5521`).

**CI verified** (run 38088631862 on `59e5521`, 2026-10-10 21:45 UTC): web job green (lint,
typecheck, unit tests, worker tests, Playwright E2E) and mobile job green (`./gradlew build`:
core JVM + Android targets, android-app debug/release, unit tests, R8, lint;
`:android-app:recordRoborazziDebug` produced the `android-captures` artifact, 518 kB).
This closes the Android verification for slices 002, 003, 004 and 005.

Captures: the artifact lives on GitHub's blob storage (`*.blob.core.windows.net`), which the
authoring sandbox's network policy denies, so `docs/captures/android/` is not yet populated from
this run. Download the `android-captures` artifact from the run page, or allow that host, then
copy `today-light.png`, `today-dark.png`, `today-offline-pending.png` into `docs/captures/android/`.

## Slice 006: identity + organizations + trips + roster + invites (API vertical)

Status: done 2026-10-11. Commit `bc09e1d`. **CI verified**: run 38100632835 green (web job: lint, typecheck, 28 worker tests in workerd with D1 migrations, web unit + Playwright; mobile job: Gradle build + Roborazzi), 2026-10-11 01:07 UTC.
Spec: ADR-0007, ADR-0009 (D12, D21, D26). Details: `docs/engineering/identity-and-roster.md`.

| Gate | Command | Result |
|---|---|---|
| Worker tests | `pnpm --filter @voysemble/api-worker test` | 9 files, 28 tests passed (workerd, D1 migrations applied per file, isolated storage) |
| Full gate | `pnpm check` | lint 97 files 0 errors, typecheck (contracts, api-worker src + test, organizer-web), 28 worker + 19 web + 10 script + 4 token tests, headers ok |

Facts established by tests:
- Magic link: 202 is identical for unknown and known addresses; token is single-use (second verify 401); garbage token 401; web verify sets `vy_session` HttpOnly/Secure/SameSite=Lax and omits the token from the body; native verify returns the token once; cookie authenticates `/v1/me`; logout revokes.
- Same email twice resolves to one account (case-insensitive).
- Org creator is `owner`; `/v1/orgs` and `/v1/me` list the membership.
- Trips: created by owner, listed by members; `endsOn < startsOn` and unknown IANA zone are 400.
- Cross-org: another org's owner gets 403 on list and create; unknown org id gives the same 403; anonymous gets 401 everywhere.
- Roster CSV: 3 rows with 2 guardians create 5 participations; guardians bound via `guardianOf`; quoted `"Lee, Hana"` survives; `guardian_contact` never appears in the response; missing `name` column 400; empty-name rows reported in `skipped`; unknown trip 404.
- Invites: 5 codes for 5 unbound rows, `XXXX-XXXX` shape, no re-issue while live; redeem accepts lower-case/no-dash, joins as `member`, binds the row, second use 409, unknown 404, bound row skipped on re-issue; member can list trips but not roster and cannot create trips.
- Leader invite grants `leader`: roster readable (6 rows incl. the leader), trip create and import still 403. Invite role enum cannot carry owner/organizer.
- CSV parser: BOM, CRLF, escaped quotes, case-insensitive headers; per-row rejection for unterminated quotes, overlong rows, too many fields; document-level throw for no header, >2000 rows, >64 KiB.
- D1 migration SQL contains every Drizzle column (`schema.test.ts`).
- OpenAPI lists all 11 paths and both security schemes.

Built:
- `packages/contracts`: `common` (Id, OrgRole, TripRole, InviteRole, Locale), `auth`, `organization`, `trip`, `roster`.
- `apps/api-worker`: `migrations/0001_identity.sql`, `src/db/{schema,client}.ts`, `src/org/{OrgDurableObject,client}.ts`, `src/email/{EmailPort,templates}.ts`, `src/auth/{service,middleware}.ts`, `src/lib/{tokens,csv,time}.ts`, routes `auth`, `organizations`, `trips`, `roster`, `openapi-common`; bindings `DB`, `ORG_DO`, `DEV_MAILBOX` (local only) in `wrangler.jsonc`; vitest config reads D1 migrations, `test/setup.ts` applies them.

Deviations found while building:
- `wrangler types` already emits `DEV_MAILBOX?: KVNamespace` because named environments omit the binding; no manual type override needed.
- `cloudflare:test` `env` is typed `Cloudflare.Env`; `TEST_MIGRATIONS` is injected via `miniflare.bindings` and cast in `test/setup.ts`.
- With `exactOptionalPropertyTypes`, `RequestInit.body` must be `null`, not `undefined`, when absent.

Not done (next slices): OIDC/native sign-in, rate limiting, native refresh rotation, leader endpoint, invite email delivery, organizer web onboarding screens, Cloudflare Email Sending transport.

## Slice 007: organizer web onboarding on the real API (sign-in, session gate, setup checklist)

Status: done 2026-10-11. Commit `ea3f263`. **CI verified**: run 38101949262 green (web job incl. Playwright against `wrangler dev` on the runner; mobile job), 2026-10-11 01:30 UTC.
Spec: D26 first run, D12 roster + invites, ADR-0007 web sessions. Details: `docs/engineering/identity-and-roster.md` ("Web console").

| Gate | Command | Result |
|---|---|---|
| Worker tests | `pnpm --filter @voysemble/api-worker test` | 9 files, 30 tests (adds leader endpoint, dev mailbox) |
| Web unit tests | `pnpm --filter @voysemble/organizer-web test` | 8 files, 30 tests (api client, sign-in, token parsing, setup checklist, CSV export, trip status) |
| Browser E2E | `pnpm --filter @voysemble/organizer-web test:e2e` against `wrangler dev` (local D1 + DO + fixture mailbox) | 26 passed in 2 projects (desktop-1440, laptop-1280); captures in `docs/captures/web/*/{sign-in,setup-1-org,setup-2-trip,setup-3-roster,setup-4-invites}.png` |
| Full gate | `pnpm check` | green |

Facts established by tests:
- Anonymous visit to `/` redirects to `/sign-in`; `/v1/me` is 401 after sign-out.
- Real magic-link round trip in the browser: request, mail captured by the fixture port, link opened, cookie session, landing on `/setup`.
- Checklist rebuilds from the API on reload (no client-only state); step states are `locked`/`open`/`done` via `data-state`.
- Org creation puts the real org name in the top bar and sidebar; trip creation puts the real trip and a date-derived status (`Planning`) in the top bar.
- Roster CSV paste creates 3 travelers + 2 guardians; "Add leader" adds 1 leader; invite issue returns 6 `XXXX-XXXX` codes rendered once; CSV download has the expected filename.
- Unit: `ApiError` carries code and correlation id from the envelope or the header; sign-in never claims an account exists; token is read only from the documented fragment shape.

Built:
- API: `POST /v1/orgs/{orgId}/trips/{tripId}/roster/leaders`; `GET /v1/dev/mailbox?to=` mounted only when `DEV_MAILBOX` is bound and `ENV_NAME=local`.
- Web: `src/lib/{api-client,query-client,session}.ts`; `features/auth/{SignInPage,VerifyPage}`; `features/setup/SetupPage` (4 steps); router with public `/sign-in`, `/auth/verify` and a pathless `app` layout whose `beforeLoad` requires a session; shell shows real org/trip/account and a sign-out button; Setup nav item pinned while no organization exists; Vite dev proxy to the Worker.
- E2E now runs against the Worker (`playwright.config.ts` webServer = `wrangler d1 migrations apply` + `wrangler dev`), so command-center and itinerary specs sign in first. Those pages still render fixtures and say "Sample data".

Deviations found while building:
- `Secure` cookies are accepted by Chromium on `http://127.0.0.1`, so the E2E sign-in works without TLS.
- Full-page Playwright screenshots render the sticky top bar at the current scroll offset; specs scroll to top before capturing.

Not done (next slices): sample screens for the ten remaining menus + tablet/phone captures (slice 008, requested by founder), KO strings, OIDC, invite revocation, roster editing.

## Slice 008: sample screens for all ten remaining menus + tablet/phone layouts

Status: done 2026-10-11. Commits `9fe63f1` + `eccbac9`. **CI verified**: run 38104048258 green (61 E2E across four viewports, unit, lint, typecheck, mobile job), 2026-10-11 02:08 UTC. First run 38103438669 failed only on the phone command center overflowing 8px with runner fonts; fixed by `eccbac9` (cards and rows shrink at <=768px).
Requested by founder ("show sample screens on other devices and all other menus"). Fixtures in
`apps/organizer-web/src/fixtures/sections.ts`; chart rules in `docs/engineering/dataviz-palette.md`.

| Gate | Command | Result |
|---|---|---|
| Web unit tests | `pnpm --filter @voysemble/organizer-web test` | 9 files, 49 tests |
| Browser E2E | `pnpm --filter @voysemble/organizer-web test:e2e` | 61 passed, 1 skipped (drawer test on tablet) across desktop-1440, laptop-1280, tablet-1024, phone-390 |
| Palette | dataviz validator on the six-kind categorical palette | light: all pass, contrast WARN on two hues covered by labels + legend; dark: all pass |

Facts established by tests:
- Each of People, Communication, Safety, Journey Graph, Travel, Media, Preparation, Reports, Billing, Settings renders its heading, the "Sample data" chip, and a fixture-derived fact (e.g. 61 joined, ack 36/38, 6 inside the window, 86% average ack, 6 ledger rows, 3 members); its nav item is `aria-current`.
- People filters narrow the table (19 rows → 5 guardians → 2 in Bus A); guardians show "guardian of <traveler>".
- Reports: hovering a column shows a tooltip; the table view exposes the same numbers.
- Unknown paths under the shell remain honest placeholders.
- Tablet and phone: six key pages render with zero horizontal overflow (the assertion names offending elements when it fails); on phones the Menu button opens the drawer (`aria-expanded`), navigation closes it.

Built:
- Ten section pages under `src/features/sections/` with a shared `SectionPage`/`Card`/`Meter` kit; SVG schematic map (meeting window states), SVG dependency chain with slack and risk, SVG column and line charts with hover + keyboard focus + table view.
- Responsive CSS: icon rail at ≤1024, drawer + menu button at ≤768, grids collapse, itinerary stacks, tables scroll.
- Playwright projects `tablet-1024` and `phone-390` run `responsive.spec.ts` only; desktop projects run everything else. Captures: `docs/captures/web/<project>/<section>.png`, plus `phone-390/nav-drawer.png`.

Deviations found while building:
- `1fr` grid tracks do not shrink below content min-width; the itinerary track needed `minmax(0, 1fr)` and `min-width: 0` on children at phone width.
- Playwright leaves the pointer where the last click happened, which triggered a chart tooltip in captures; specs park the pointer at (0,0) first.
- Biome rejects `role="button"` on SVG groups (no semantic element exists in SVG); two documented ignores in `charts.tsx`.

Not done (next slices): KO strings; Android screens beyond Today (head count, announcements, window) in the Roborazzi suite; moving People/Communication onto the real API.

## Slice 009: mobile head count, bulletin, meeting window (KMP models + Compose + SwiftUI)

Status: done 2026-10-11. Commits `903c57d` … `878a83d`. **CI verified**: mobile job green from run 38105667941 (Android build, unit tests, six Roborazzi captures); iOS job green on run 38106937743 (`macos-15`, XcodeGen, Gradle framework with SKIE, `xcodebuild test` on an iPhone simulator, XCTest incl. CoreModelsTests interop), 2026-10-11 03:07 UTC.
Spec: D14, D15, D16, D25 (ADR-0009). Atlas screens #7, #9, #15.

| Gate | Command | Result |
|---|---|---|
| Core JVM tests | `cd mobile && ./gradlew :core:jvmTest -Pvoysemble.android=false` | 6 classes, 23 tests passed (adds HeadcountModelTest 6, AnnouncementsModelTest 3, MeetingWindowModelTest 4) |
| Android build + unit + screenshots | CI `mobile` job: `./gradlew build` then `:android-app:recordRoborazziDebug` | pending |
| iOS | CI `ios` job on `macos-15`: XcodeGen, Gradle framework, `xcodebuild test` on an iPhone simulator (XCTest: AppConfig + CoreModelsTests interop) | green, run 38106937743 |

Facts established by core tests:
- Head count: fixture opens 18/20 with Dohyun Kang and Eunwoo Shin pinned as missing; a toggle marks present and flips the session to PENDING sync; excused and with-other-group count as accounted; close turns every unmarked member into MISSING, records `closedWithMissing`, stays PENDING until `markSynced`, and later marks are ignored; unknown ids are ignored; explicit MISSING sorts before unmarked.
- Announcements: only required, unacknowledged items can be acknowledged; the ack lands in the outbox as PENDING; confirm drains the outbox and increments the count; wrong transitions are no-ops; the fixture carries a KO machine translation next to the original.
- Meeting window: open strictly between start and end; minutes left; opt-in moves the traveler to UNCERTAIN, opt-out back to OPTED_OUT, nobody else changes; counts per state; a leader device (no self) cannot opt in.

Built:
- `core`: `window/MeetingWindowModel.kt`, `headcount/HeadcountModel.kt`, `announcements/AnnouncementsModel.kt`; fixture gains `headcountBusA()`, `announcements()`, `meetingWindow()`.
- `android-app`: `ui/Widgets.kt` (VyCard, ScreenHeader, LabelChip, SyncChip, SampleDataChip), five icons, `headcount/`, `bulletin/`, `window/` view models + screens, `AppNavigation.kt` (tabs + pushed screens, BackHandler), Today wires "Open head count" and the meeting-point button. Screenshot tests: `headcount-open`, `headcount-closed-dark`, `bulletin-light`, `bulletin-offline-queued`, `window-open`, `window-sharing-dark`. Unit test: HeadcountViewModelTest.
- `ios-app`: `HeadcountView`, `BulletinView`, `MeetingWindowView` with observable models over the same core functions (SKIE `onEnum`).

Not done: real sync for the outbox and head-count sessions; navigation library.

## Slice 010: announcements and acknowledgments end to end

Status: done 2026-10-11. Commit `878a83d`. **CI verified**: run 38106937743 green (web incl. 63 E2E, mobile, ios), 2026-10-11 03:07 UTC.
Spec: D16, D13 (ADR-0009). Details: `docs/engineering/announcements.md`.

| Gate | Command | Result |
|---|---|---|
| Worker tests | `pnpm --filter @voysemble/api-worker test` | 10 files, 33 tests (adds announcements.test.ts: 3) |
| Core JVM tests | `cd mobile && ./gradlew :core:jvmTest -Pvoysemble.android=false` | 25 tests (adds AnnouncementsSyncTest: 2) |
| Web unit tests | `pnpm --filter @voysemble/organizer-web test` | 9 files, 50 tests |
| Browser E2E | `pnpm --filter @voysemble/organizer-web test:e2e` | 63 passed, 1 skipped across four viewports (local and CI) |

Facts established by tests:
- Organizer publishes with `authorName` "Organizer"; a participating leader publishes under their name; a plain member gets 403; another org 403; unknown trip 404.
- Traveler and leader see every item; guardian sees only `sharedWithGuardians`; `ackTotal` counts travelers + leaders (4 in the fixture).
- Ack is stored once; a replay returns `created: false` with the original `receivedAt`; `myAck` and `ackCount` reflect it; guardians and the organizer cannot ack (403); non-ack announcements reject acks (400).
- Ack status lists acked and unacked names; travelers cannot read it.
- Core: list sends the bearer token; merge keeps queued ids PENDING and confirms server-acknowledged ones; replay confirms on Ok and keeps failed ids with the exact JSON body sent.
- Browser: organizer publishes from Communication, sees 0/2 with both names unacked; after the traveler redeems and acks through the API, the meter reads 1/2 and only Juho Kim remains.

Built:
- Contracts `announcement.ts`; OrgDO schema v2 (`announcements`, `acks`) and methods; routes `announcements.ts`.
- KMP core `api/Announcements.kt` (DTOs, `mergeAnnouncements`, `replayAckOutbox`), `ApiClientConfig.sessionToken`, bearer header on authenticated calls.
- Web `CommunicationPage` on the API with composer and unacked names; `SectionPage` gains `sample` so the page chip appears only on fixture pages; E2E `announcements.spec.ts` and capture `communication-live.png`.

Deviations found while building:
- Playwright's `page.request` does not send `Secure` cookies to `http://127.0.0.1`; the traveler's API calls in E2E run as in-page `fetch`.
- A disabled TanStack query reports `isPending`; the page only counts the trips query once an organization exists.
- TanStack `<Link>` throws outside a router; the setup pointer is a plain anchor so the page unit-tests without one.

Not done: machine translation, nudge pushes, mobile Bulletin screen wired to the API (needs native sign-in, next slice candidate).

### iOS verification path (recorded 2026-10-11)

Four CI rounds got the iOS app from "never compiled" to green on a macOS runner:
1. `xcodebuild` found no simulator named "iPhone 16" on `macos-15` → pick an available iPhone by UDID, download the iOS platform if none.
2. Generated `Tokens.swift` declared `enum Type` → Swift forbids it; the generator now emits `Typography` for Swift.
3. Swift called Kotlin top-level extension functions through `…Kt` facades and switched Kotlin enums via SKIE `onEnum` → extensions are Swift members and SKIE enums switch directly.
4. Green: app + tests on the simulator in about 2 minutes after the framework build.

## Slice 011: mobile sign-in, invite redeem, live Bulletin

Status: done 2026-10-11. Commits `d316d52` … `96b32bd`. **CI verified**: mobile job green on run 38111178582 (Android build, unit tests incl. SessionViewModelTest, Roborazzi captures incl. sign-in and invite); ios job green on run 38110567423 (Swift 5 mode, Keychain store, SessionModel, sign-in and invite views, XCTest). Three rounds: positional fixture arg in a test, Swift 6 strict concurrency vs non-Sendable framework types, and coroutine timing in a view model test (actions now return their Job).
Spec: ADR-0007 (mobile magic link), D12, D16, D28. Details: `docs/engineering/mobile-auth.md`.

| Gate | Command | Result |
|---|---|---|
| Worker tests | `pnpm --filter @voysemble/api-worker test` | 10 files, 34 tests (adds `GET /v1/me/participations`) |
| Core JVM tests | `cd mobile && ./gradlew :core:jvmTest -Pvoysemble.android=false` | 30 tests (adds SessionManagerTest 3, BulletinSyncTest 2) |
| Android + iOS | CI `mobile` and `ios` jobs | green (runs 38111178582, 38110567423) |

Facts established by tests:
- `GET /v1/me/participations` lists the redeemed traveler's trip with names and role; the organizer with no participation gets an empty list; anonymous 401.
- Token extraction accepts a pasted link fragment or a bare token; rejects short strings and query-string tokens.
- Full native flow against a mock server: request → AwaitingLink; verify stores the token and lands on NeedsInvite; redeem stores the active trip with its name; authenticated calls carry `Bearer`; sign-out calls logout and clears the store.
- A 401 on verify or a garbage token leaves the state SignedOut.
- Bulletin sync replays the outbox before listing (call order asserted), merges server acks, reports confirmations; an unreachable server keeps the local feed offline with the outbox intact.
- Android view model: safe messages for expired link, missing token, unknown code; sample mode is UI-only.

Built: see the engineering doc. Captures (CI): `sign-in.png`, `sign-in-awaiting-dark.png`, `invite.png`.

Not done: App Links / Universal Links, Apple/Google sign-in, native refresh rotation, KO strings.

## Slice 012: head count sessions on the API, live Android head count

Status: done 2026-10-11. Commits `b30e99a`, `63cf589`. **CI verified**: run 38112801875 green (web incl. E2E, mobile incl. HeadcountViewModelTest live cases, ios), 2026-10-11 04:58 UTC. Run 38112192499 (first push) was red on mobile: see deviations.
Spec: D14, D25 (ADR-0009). Details: `docs/engineering/headcounts.md`.

| Gate | Command | Result |
|---|---|---|
| Worker tests | `pnpm --filter @voysemble/api-worker test` | 11 files, 36 tests (adds headcounts.test.ts: 2), no uncaught-exception log |
| Core JVM tests | `cd mobile && ./gradlew :core:jvmTest -Pvoysemble.android=false` | 35 tests (adds HeadcountsSyncTest: 4, ApiClientTest verify body: 1) |
| Android + iOS | CI `mobile` and `ios` jobs | HeadcountViewModelTest grows to 3 (two live), screenshots unchanged |

Facts established by tests: see the engineering doc ("Facts established by tests").

Built:
- Contracts `headcount.ts`; OrgDO schema v3 (`headcounts`, `headcount_marks`), `syncHeadcount`
  (idempotent upsert, closed is final, conflict returned as a value), `listHeadcounts`; routes
  `headcounts.ts` (PUT by client id, GET list) for owner/organizer/participating leader.
- KMP core `api/Headcounts.kt`: DTOs, `toSyncRequest`, `headcountFromRoster`, `pushHeadcount`;
  `ApiClient.syncHeadcount`, `listHeadcounts`, `listRoster`.
- Android `HeadcountViewModel` live mode (roster seed, open push, close push, retry), `HeadcountStatus`
  on the screen ("Live"/"Syncing" chip, loading and error lines, tappable "Pending sync").

Deviations found while building:
- A plain `throw` inside a Durable Object method shows up as "uncaught exception" in the workerd
  log even when the route catches it; expected outcomes now return values.
- CI run 38112192499 (mobile red): the core JSON config omitted nulls and defaults when encoding,
  so the open-session push lacked `closedAtDevice` and native verify lacked `client: "native"`
  (a latent slice 011 bug: no session token on a real device). Fixed in `ApiClient`'s Json config
  with regression tests; core JVM tests 35.

Not done: incident auto-creation on close with missing, dashboard tile on real sessions, guardian
status, iOS live mode.

## Slice 013: incidents from head counts, live Safety page

Status: done 2026-10-11. Commits `b9a4801` … `ffabde0`. **CI verified**: run 38114717623 green (web incl. 66 E2E across four viewports, mobile, ios), 2026-10-11 05:29 UTC. Runs 38113821044 and 38113832587 were red on the web job only: see deviations.
Spec: D25 (second half), D17 (card), ADR-0009. Details: `docs/engineering/incidents.md`.

| Gate | Command | Result |
|---|---|---|
| Worker tests | `pnpm --filter @voysemble/api-worker test` | 12 files, 38 tests (adds incidents.test.ts: 2) |
| Core JVM tests | `cd mobile && ./gradlew :core:jvmTest -Pvoysemble.android=false` | 35 tests (incidentId on push result asserted) |
| Web unit tests | `pnpm --filter @voysemble/organizer-web test` | 9 files, 51 tests (Safety live + fixture cases) |
| Browser E2E | `pnpm --filter @voysemble/organizer-web test:e2e` | adds `headcounts.spec.ts`; see the CI row |

Facts established by tests: see the engineering doc.

Built:
- Contracts `incident.ts`; `SyncHeadcountResponse.incidentId`.
- OrgDO schema v4 (`incidents` with UNIQUE `headcount_id`, `incident_people`), `openHeadcountIncident`
  (idempotent per head count), `listIncidents`, `resolveIncident` (results as values: notFound,
  alreadyResolved); routes `incidents.ts` (list, resolve) for staff.
- Console: `incidentsQuery`, `headcountsQuery`, `incidents.resolve`; Safety page Incidents card on the
  API with inline resolve note; fixture cards carry their own "Sample data" chip; capture `safety-live.png`.
- Core: `incidentId` on `SyncHeadcountResponseDto` and `HeadcountPushResult`.

Deviations found while building:
- Playwright's web server serves the built console: a changed page needs `pnpm build` before a local
  E2E run, or the old bundle answers (the config comment says so; it bit once anyway).
- CI runs 38113821044 and 38113832587 (web red): `sections.spec.ts` asserted one "Sample data" chip per
  page with a strict locator; Safety now carries one per fixture card (three). The loop asserts the
  first chip. The earlier local full-suite run reported green, so a local pass is not proof: CI is.

Not done: manual incident creation, leader confirmation from the phone, guardian status message,
amber dashboard tile on real sessions, person timeline.

## Slice 014: command center on the API

Status: done 2026-10-11. Commit `487c525`. **CI verified**: run 38139210064 green (web incl. E2E, mobile, ios), 2026-10-11 12:34 UTC.
Spec: D25 (amber tile), D16 (ack rate), ADR-0009. Details: `docs/engineering/command-center-live.md`.

| Gate | Command | Result |
|---|---|---|
| Web unit tests | `pnpm --filter @voysemble/organizer-web test` | 10 files, 57 tests (adds live-dashboard.test.ts: 4, view live and subtitle cases: 2) |
| Browser E2E (local) | `pnpm --filter @voysemble/organizer-web test:e2e` | 65 passed, 1 skipped across four viewports |
| Browser E2E | `pnpm --filter @voysemble/organizer-web test:e2e` | `headcounts.spec.ts` now also covers the live Today page; see the CI row |

Facts established by tests: see the engineering doc.

Built:
- `lib/live-dashboard.ts` (pure mapper + fetch), `CommandCenterPage` live/fixture switch, "Live" chip,
  empty lines in the movements, head count, and announcements panels, shell alert dot on open incidents.
- Capture `command-center-live.png`.

Deviations found while building:
- The Travelers tile summed active-status trips, so a trip in planning (the sample trip starts in
  December) read 0; it now counts the selected trip. The subtitle read "Day -75" before a trip; it now
  reads "starts in N days" and "ended" after. "0% Acknowledged" with nothing to acknowledge reads "—".

Not done: movements on the API, trip switching, account display names.

## Slice 015: announcement translation through the AI port

Status: done 2026-10-11. Commit `0c2cfcd`. **CI verified**: run 38139703983 green (web incl. E2E, mobile, ios), 2026-10-11 12:43 UTC.
Spec: D03, D16, ADR-0006, ADR-0009 (translation rule). Details: `docs/engineering/translation.md`.

| Gate | Command | Result |
|---|---|---|
| Worker tests | `pnpm --filter @voysemble/api-worker test` | 13 files, 41 tests (adds ai.test.ts: 3; announcements publish case grows) |
| Core JVM tests | `cd mobile && ./gradlew :core:jvmTest -Pvoysemble.android=false` | 35 tests (merge carries translation + label) |
| Web unit tests | `pnpm --filter @voysemble/organizer-web test` | 10 files, 57 tests (Communication shows the labelled block) |
| Browser E2E | `pnpm --filter @voysemble/organizer-web test:e2e` | `announcements.spec.ts` asserts the translation; see the CI row |

Facts established by tests: see the engineering doc.

Built:
- `ai/AiPort.ts` (Workers AI via gateway, fixture, disabled; `detectLocale`), `ai` binding in named
  environments only, `Bindings` extended with optional `AI` and `AI_GATEWAY_ID`.
- Contracts `AnnouncementTranslation`, `Announcement.translation`, `EditTranslationRequest`; OrgDO schema v5;
  publish translates once; `PUT .../translation` for staff.
- Console translation block; core DTO, item fields, `translationLabel`; Android and iOS labels.

Not done: title translation, both-direction storage, guardian parent-safe copy, usage rollups.

## Slice 016: leader confirmation and the guardian status message

Status: done 2026-10-11. Commit `1781316`. **CI verified**: run 38156194574 green (web incl. E2E, mobile incl. IncidentsViewModelTest and captures, ios incl. IncidentsView), 2026-10-11 16:46 UTC. First push green.
Spec: D17, D13 visibility (guardian sees incident status), ADR-0009. Details: `docs/engineering/incidents.md` (slice 016 section).

| Gate | Command | Result |
|---|---|---|
| Worker tests | `pnpm --filter @voysemble/api-worker test` | 13 files, 42 tests (incidents.test.ts grows to 3) |
| Core JVM tests | `cd mobile && ./gradlew :core:jvmTest -Pvoysemble.android=false` | 37 tests (adds IncidentsSyncTest: 2) |
| Web unit tests | `pnpm --filter @voysemble/organizer-web test` | 10 files, 57 tests (Safety live case grows) |
| Android + iOS | CI `mobile` and `ios` jobs | IncidentsViewModelTest (3), IncidentsScreenshotTest (2), iOS IncidentsView compiles |
| Browser E2E | `pnpm --filter @voysemble/organizer-web test:e2e` | `headcounts.spec.ts` covers confirm + guardian message; see the CI row |

Facts established by tests: see the engineering doc.

Built:
- Contracts `ConfirmationStatus`, `IncidentConfirmation`, `ConfirmIncidentRequest`, `GuardianMessage`;
  `Incident.confirmations`, `Incident.guardianMessage`. OrgDO schema v6; `confirmIncident`,
  `sendGuardianMessage`, `composeGuardianMessage` (EN + KO templates, trip-zone clock), guardian projection
  on `listIncidents`; routes confirm and guardian-message; guardians may list.
- Console: confirmation chip and line, "Send guardian message", sent bodies.
- Core incidents model + API; Android `IncidentsScreen`/`IncidentsViewModel` (live and sample) reachable from
  Today; iOS `IncidentsView` (fixture); fixture `incidents()`.

Not done: push delivery, guardian phone screen, iOS live incidents, manual incident creation.

## Slice 017: itinerary on the API

Status: done 2026-10-11. Commit `d990748`. **CI verified**: run 38161008881 green (web incl. 68 E2E across four viewports, mobile incl. TodayViewModelTest live cases, ios), 2026-10-11 17:53 UTC. First push green.
Spec: D24, D19 (revisions), D13 (guardians read the published itinerary). Details: `docs/engineering/itinerary.md`.

| Gate | Command | Result |
|---|---|---|
| Worker tests | `pnpm --filter @voysemble/api-worker test` | 14 files, 43 tests (adds itinerary.test.ts: 1 long case) |
| Core JVM tests | `cd mobile && ./gradlew :core:jvmTest -Pvoysemble.android=false` | 39 tests (adds TodayBuilderTest: 2) |
| Web unit tests | `pnpm --filter @voysemble/organizer-web test` | 11 files, 60 tests (adds itinerary-api.test.ts: 2, reducer live helpers: 1) |
| Android + iOS | CI `mobile` and `ios` jobs | TodayViewModelTest grows to 4 (two live) |
| Browser E2E | `pnpm --filter @voysemble/organizer-web test:e2e` | adds the live itinerary case; see the CI row |

Facts established by tests: see the engineering doc.

Built:
- Contracts `itinerary.ts`; OrgDO schema v7 (`itinerary_events`, `itinerary_revisions`), `getItinerary`
  (draft or published view, unpublished count, derived days), `upsertItineraryEvent`, `deleteItineraryEvent`,
  `publishItinerary` (optimistic revision); routes get, put, delete, publish; `delete` helper in tests.
- Console `itinerary-api.ts` (mapping both ways, `itineraryApi`), reducer `makeId`/`publish(revision)`/`load`,
  `LiveEditor` with debounced saves and conflict reload, "Live" chip and notice banner; capture `itinerary-live.png`.
- Core `api/Itinerary.kt`, `today/TodayBuilder.kt`; Android live `TodayViewModel` and header chip.

Deviations found while building:
- `getByLabel('Place')` also matched the top-bar search placeholder ("Search trips, people, places"); the
  E2E uses an exact label.
- The sample roster import creates 5 participations (3 travelers + 2 guardians), not 3; the itinerary test
  asserts the real count.

Not done: day labels, leader change proposals, revision diff with ack, disruption drafts, iOS live Today.

## Slice 018: leader change proposals

Status: done 2026-10-11. Commit `4c2f824`. **CI verified**: run 38166422967 green (web incl. 70 E2E across four viewports, mobile incl. TodayViewModelTest propose cases, ios), 2026-10-11 19:10 UTC. First push green.
Spec: D24, D19 (single publisher). Details: `docs/engineering/itinerary.md` (slice 018 section).

| Gate | Command | Result |
|---|---|---|
| Worker tests | `pnpm --filter @voysemble/api-worker test` | 14 files, 44 tests (itinerary.test.ts grows to 2) |
| Core JVM tests | `cd mobile && ./gradlew :core:jvmTest -Pvoysemble.android=false` | 40 tests (adds ProposalsTest: 1) |
| Web unit tests | `pnpm --filter @voysemble/organizer-web test` | 11 files, 62 tests (reducer seeding, describePatch) |
| Android + iOS | CI `mobile` and `ios` jobs | TodayViewModelTest grows to 6 (propose live, propose 403) |
| Browser E2E | `pnpm --filter @voysemble/organizer-web test:e2e` | adds the proposal case; see the CI row |

Facts established by tests: see the engineering doc.

Built:
- Contracts: `ProposalKind`, `ProposalStatus`, `ProposalPatch`, `CreateProposalRequest`, `ItineraryProposal`,
  `ProposalList`, `DecideProposalRequest`. OrgDO schema v8; `createProposal`, `listProposals`,
  `decideProposal` (accept applies edit/add/remove to the draft); routes create, list, decide.
- Console `ProposalsPanel` above the live editor; `proposalsApi`, `describePatch`; the reducer seeds its draft
  count from unpublished rows on init and load; capture `itinerary-proposal.png`.
- Core `ProposalPatchDto` (untouched fields omitted), `CreateProposalRequestDto`, `ItineraryProposalDto`,
  `ApiClient.createProposal`. Android `TodayViewModel.propose`, "Propose a change" on the up-next card with a
  dialog (new start, note), sent/error states.

Deviations found while building:
- The client's "encode nulls and defaults" rule (slice 012) would have sent every untouched patch field as
  null; the patch DTO opts out per field with `EncodeDefault.Mode.NEVER` and the core test pins the body.

Not done: proposing from iOS, add/remove proposals from the phone, the revision diff with ack, day labels.

## Slice 019: App Links and Universal Links for the magic link

Status: built 2026-10-11, CI pending (run id recorded below once green).
Spec: ADR-0007 (mobile magic link), ADR-0008 (hosts). Details: `docs/engineering/mobile-auth.md` (slice 019 section).

| Gate | Command | Result |
|---|---|---|
| Worker tests | `pnpm --filter @voysemble/api-worker test` | 15 files, 46 tests (adds wellknown.test.ts: 2) |
| Android + iOS | CI `mobile` and `ios` jobs | AppLinksTest (2); manifest with autoVerify filter; iOS entitlement embedded |

Built:
- Worker `routes/wellknown.ts` (assetlinks.json, apple-app-site-association from vars; empties when unset),
  `/.well-known/*` in `run_worker_first`, optional vars on `Bindings`.
- Android: autoVerify intent filter with a per-build-type host placeholder, `BuildConfig.LINK_HOST`, `singleTop`,
  `magicLinkFrom`, `PendingLink`, `AppRoot` verifies a pending link once.
- iOS: associated-domains entitlement, `onOpenURL` / `onContinueUserActivity`, `SessionModel.openMagicLink`.

Not done: real fingerprints and team id (deploy-time vars), claiming every preview host (only `next`),
Apple/Google native sign-in.
