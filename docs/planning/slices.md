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
