# mobile/

Kotlin Multiplatform workspace (ADR-0003). Build, test, and CI guideline:
`docs/engineering/mobile-build-and-test.md`.

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
| Today, guardian card (slice 025) | `today/TodayScreen.kt` (`GuardianStatusCard`) | `Today/TodayView.swift` (`GuardianStatusCard`) | `today-guardian.png` on both |
| Incidents (slice 016) | `android-app/.../incidents/IncidentsScreen.kt` | `ios-app/Voysemble/Incidents/IncidentsView.swift` | same, `incidents-*.png` |

iOS evidence: `ios-app/VoysembleTests/CaptureTests.swift` writes `docs/captures/ios/*.png` on the CI
simulator (slice 022). Live data on iOS (Today, Bulletin, Head count, Incidents): slice 024,
`docs/engineering/ios-live.md`.

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

Android and iOS are verified in CI on every push (`mobile` and `ios` jobs); run ids per slice are
in `docs/planning/slices.md`.

## iOS in CI

`.github/workflows/ci.yml` job `ios` runs on `macos-15`: `brew install xcodegen`, `xcodegen
generate`, a warm `./gradlew :core:linkDebugFrameworkIosSimulatorArm64 -Pvoysemble.android=false`,
then `xcodebuild test` on an available iPhone simulator picked by UDID. The Xcode pre-build script reads
`VOYSEMBLE_ANDROID=false` so Gradle skips the Android included build on that host. The log is
uploaded as the `ios-build-log` artifact.
