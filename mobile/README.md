# mobile/

Kotlin Multiplatform workspace (ADR-0003).

| Module | What | Builds where |
|---|---|---|
| `core` | Shared Kotlin: API client, (later) sync, SQLite, crypto, domain rules. Targets `jvm`, `android`, `iosArm64`, `iosSimulatorArm64` | JVM anywhere; Android needs Google Maven + SDK; iOS needs macOS |
| `android-app` | Jetpack Compose app, built-in Kotlin (AGP 9) | Hosts with Android SDK |
| `ios-app` | SwiftUI app. `project.yml` (XcodeGen) is the source; `.xcodeproj` is generated and gitignored | macOS |

Design tokens: `packages/design-tokens` generates `core/.../design/Tokens.kt` and
`ios-app/Voysemble/Design/Tokens.swift`. Regenerate with `pnpm --filter @voysemble/design-tokens build`.

## Commands

```sh
cd mobile
./gradlew :core:jvmTest -Pvoysemble.android=false   # any host, no Google Maven needed
./gradlew build                                      # full: core (all targets available on host) + android-app
cd ios-app && xcodegen generate && open Voysemble.xcodeproj   # macOS
```

`voysemble.android=false` drops the Android target and app for hosts that cannot reach
`dl.google.com` (some sandboxes). Default is `true` (CI, developer machines).

## Pins (gradle/libs.versions.toml)

Kotlin 2.4.20 (SKIE 0.10.15 ceiling), Gradle 9.6.0, AGP 9.3.1 (max supported by KGP 2.4.x), Compose BOM 2026.09.00,
Ktor 3.6.0, kotlinx.serialization 1.11.0, coroutines 1.11.0, datetime 0.8.0, SKIE 0.10.15.
`compileSdk`/`targetSdk` 36, `minSdk` 26, JDK 21 toolchain.

Known-unverified as of 2026-10-10 (no Google Maven in the authoring sandbox): Android target
script (`core/android-target.gradle.kts`), `android-app` build file. First build on a host with
the SDK must confirm; fix forward and record in `docs/planning/slices.md`.
