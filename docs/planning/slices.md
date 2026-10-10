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

Unverified until a host with the Android SDK runs CI: `core/android-target.gradle.kts`, `android-app/build.gradle.kts`. First failure there is the next fix-forward.

## Slice 003 (next): P1 visual foundation, web console shell + command center on fixtures

Planned. Contract to be written before start.
