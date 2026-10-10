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

Not done: no auth, no live data, no KO strings, no itinerary editor (slice 004), E2E not yet in CI
(added to the web job in this commit; first CI run verifies it).

## Slice 004 (next): PC itinerary editor on fixtures (second visual acceptance screen)

Planned. Contract to be written before start.
