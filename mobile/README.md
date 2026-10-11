# mobile/

Kotlin Multiplatform workspace (ADR-0003).

| Module | What | Builds where |
|---|---|---|
| `core` | Shared Kotlin: API client, (later) sync, SQLite, crypto, domain rules. Targets `jvm`, `android`, `iosArm64`, `iosSimulatorArm64` | JVM anywhere; Android needs Google Maven + SDK; iOS needs macOS |
| `android-app` | Jetpack Compose app, built-in Kotlin (AGP 9) | Hosts with Android SDK |
| `ios-app` | SwiftUI app. `project.yml` (XcodeGen) is the source; `.xcodeproj` is generated and gitignored | macOS |

Design tokens: `packages/design-tokens` generates `core/.../design/Tokens.kt` and
`ios-app/Voysemble/Design/Tokens.swift`. Regenerate with `pnpm --filter @voysemble/design-tokens build`.

## Screens

| Screen | Android | iOS | Evidence |
|---|---|---|---|
| Today (slice 005) | `android-app/.../today/TodayScreen.kt` | `ios-app/Voysemble/Today/TodayView.swift` | `./gradlew :android-app:recordRoborazziDebug` -> `docs/captures/android/` |
| Head count (slice 009) | `android-app/.../headcount/HeadcountScreen.kt` | `ios-app/Voysemble/Headcount/HeadcountView.swift` | same, `headcount-*.png` |
| Bulletin (slice 009) | `android-app/.../bulletin/BulletinScreen.kt` | `ios-app/Voysemble/Bulletin/BulletinView.swift` | same, `bulletin-*.png` |
| Sign-in + invite (slice 011) | `android-app/.../auth/*Screen.kt` | `ios-app/Voysemble/Auth/SignInView.swift` | same, `sign-in*.png`, `invite.png` |
| Meeting window (slice 009) | `android-app/.../window/MeetingWindowScreen.kt` | `ios-app/Voysemble/Window/MeetingWindowView.swift` | same, `window-*.png` |

Shared rules and fixtures: `core/src/commonMain/kotlin/com/voysemble/core/today`, `.../fixtures`.

## Commands

```sh
cd mobile
./gradlew :core:jvmTest -Pvoysemble.android=false   # any host, no Google Maven needed
./gradlew build                                      # full: core (all targets available on host) + android-app
cd ios-app && xcodegen generate && open Voysemble.xcodeproj   # macOS
```

Plugins are precompiled convention plugins in `build-logic/` (always) and `build-logic-android/` (included only when `voysemble.android=true`); see their build files for why.
`voysemble.android=false` drops the Android target and app for hosts that cannot reach
`dl.google.com` (some sandboxes). Default is `true` (CI, developer machines).

## Pins (gradle/libs.versions.toml)

Kotlin 2.4.20 (SKIE 0.10.15 ceiling), Gradle 9.6.0, AGP 9.3.1 (max supported by KGP 2.4.x), Compose BOM 2026.09.00,
Ktor 3.6.0, kotlinx.serialization 1.11.0, coroutines 1.11.0, datetime 0.8.0, SKIE 0.10.15.
`compileSdk` 37 (required by Compose BOM 2026.09), `targetSdk` 36, `minSdk` 26, JDK 21 toolchain.

Known-unverified as of 2026-10-10 (no Google Maven in the authoring sandbox): Android target
script (`core/android-target.gradle.kts`), `android-app` build file. First build on a host with
the SDK must confirm; fix forward and record in `docs/planning/slices.md`.

## iOS in CI

`.github/workflows/ci.yml` job `ios` runs on `macos-15`: `brew install xcodegen`, `xcodegen
generate`, a warm `./gradlew :core:linkDebugFrameworkIosSimulatorArm64 -Pvoysemble.android=false`,
then `xcodebuild test` on an iPhone 16 simulator. The Xcode pre-build script reads
`VOYSEMBLE_ANDROID=false` so Gradle skips the Android included build on that host. The log is
uploaded as the `ios-build-log` artifact.
