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
| Head count (slice 009; care-note reveal since 030) | `android-app/.../headcount/HeadcountScreen.kt` | `ios-app/Voysemble/Headcount/HeadcountView.swift` | same, `headcount-*.png` |
| Bulletin (slice 009) | `android-app/.../bulletin/BulletinScreen.kt` | `ios-app/Voysemble/Bulletin/BulletinView.swift` | same, `bulletin-*.png` |
| Sign-in + invite (slice 011; revocation notice since 031) | `android-app/.../auth/*Screen.kt` | `ios-app/Voysemble/Auth/SignInView.swift` | same, `sign-in*.png`, `invite.png` |
| Meeting window (slice 009, live since 029, leader opens since 032) | `android-app/.../window/MeetingWindowScreen.kt` + `AndroidLocationSource.kt` | `ios-app/Voysemble/Window/MeetingWindowView.swift` + `CoreLocationSource.swift` | same, `window-*.png`; `docs/engineering/meeting-windows.md` |
| Today, guardian card (slice 025; care-note entry since 032) | `today/TodayScreen.kt` (`GuardianStatusCard`, `GuardianCareCard`) | `Today/TodayView.swift` (`GuardianStatusCard`, `GuardianCareCard`) | `today-guardian.png`, `today-guardian-care.png` on both |
| Incidents (slice 016) | `android-app/.../incidents/IncidentsScreen.kt` | `ios-app/Voysemble/Incidents/IncidentsView.swift` | same, `incidents-*.png` |
| Chats (slice 033) | `android-app/.../chat/ChatsScreen.kt` | `ios-app/Voysemble/Chat/ChatsView.swift` | same, `chats-*.png`; `docs/engineering/chat.md` |
| Plan (slice 035; proposals from any event) | `android-app/.../plan/PlanScreen.kt` + `today/ProposeChange.kt` | `ios-app/Voysemble/Plan/PlanView.swift` + `Today/ProposeChange.swift` | same, `plan-*.png`; `docs/engineering/itinerary.md` |
| Bookings on the Plan tab (slice 047; D37 travel) | `android-app/.../plan/PlanScreen.kt` (`bookings`) | `ios-app/Voysemble/Plan/PlanView.swift` (`bookings`, `BookingRow`) | `plan-day.png`, `plan-arrival.png`; `docs/engineering/travel.md` |
| Packing (slice 048; D38 checklist) | `android-app/.../packing/PackingScreen.kt` | `ios-app/Voysemble/Packing/PackingView.swift` | same, `packing-*.png`; `docs/engineering/packing.md` |
| Rooming list (slice 059; D41) | `android-app/.../plan/RoomingScreen.kt` | `ios-app/Voysemble/Plan/RoomingView.swift` | same, `rooming-*.png`; `docs/engineering/travel.md` |
| Inbox (slice 053; D29 lanes) | `android-app/.../notifications/InboxScreen.kt` + `ui/NotificationChannels.kt` | `ios-app/Voysemble/Notifications/InboxView.swift` | same, `inbox-*.png`; the bell in `today-light.png`; `docs/engineering/notifications.md` |
| Memories (slice 044; D18 photos) | `android-app/.../memories/MemoriesScreen.kt` + `AndroidImages.kt` | `ios-app/Voysemble/Memories/MemoriesView.swift` | same, `memories-*.png`; `docs/engineering/media.md` |

iOS evidence: `ios-app/VoysembleTests/CaptureTests.swift` writes `docs/captures/ios/*.png` on the CI
simulator (slice 022; iOS 26 with Liquid Glass since slice 037, `docs/engineering/ios-liquid-glass.md`). Live data on iOS (Today, Bulletin, Head count, Incidents): slice 024,
`docs/engineering/ios-live.md`.

Android view-model tests (`*ViewModelTest.kt`) run with `Dispatchers.setMain(UnconfinedTestDispatcher())`
and a Ktor `MockEngine`: the first answer may land before the line after the constructor runs, so a
test awaits `vm.ready` and pins what the answer did, never the state before it (CI run 38280896774).

Shared rules and fixtures: `core/src/commonMain/kotlin/com/voysemble/core/today`, `.../fixtures`.
User-facing text in both languages: `.../i18n` (slice 039, `docs/engineering/mobile-i18n.md`); screens call
`tr(Txt.KEY)` on Android and `tr(.key)` on iOS, never a literal.

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
