# Native apps: build, test, and verify

How to build and test the Kotlin Multiplatform core, the Android app, and the iOS app, on a
developer machine and in CI, and the rules we learned the hard way. Companion to
`mobile/README.md` (module map and pins) and `docs/decisions/ADR-0003-mobile-runtime-kmp.md`.

## 1. Layout and what runs where

| Module | Language | Host needed to build | Host needed to test |
|---|---|---|---|
| `mobile/core` | Kotlin Multiplatform (jvm, android, iosArm64, iosSimulatorArm64) | any host for `jvm`; Android SDK + Google Maven for `android`; macOS for `ios*` | JVM tests run anywhere |
| `mobile/android-app` | Kotlin + Jetpack Compose | Android SDK + Google Maven | JVM (Robolectric), no emulator |
| `mobile/ios-app` | Swift + SwiftUI, XcodeGen project | macOS + Xcode | iOS simulator |

Rules live in `core` (pure Kotlin, no I/O, no clock). Screens are thin: Compose and SwiftUI
render core models and call core functions. Fixtures live in `core/.../fixtures` and feed both apps.

## 2. Prerequisites

| Tool | Version | Notes |
|---|---|---|
| JDK | 21 (Temurin) | `jvmToolchain(21)` in the convention plugin |
| Gradle | 9.6.0 wrapper | `./gradlew` only; never a system Gradle |
| Kotlin | 2.4.20 | SKIE 0.10.15 ceiling; do not bump without checking SKIE |
| Android SDK | compileSdk 37, targetSdk 36, minSdk 26 | needs `dl.google.com` (Google Maven) |
| Xcode | 16.4 (CI image `macos-15`) | XcodeGen via Homebrew |

Hosts without Google Maven (some sandboxes) pass `-Pvoysemble.android=false`: the Android
included build, target, and app are dropped and everything else still works.

## 3. Commands

```sh
cd mobile

# Core rules, any host, no network beyond Maven Central (retry on HTTP 429)
./gradlew :core:jvmTest -Pvoysemble.android=false

# Full Android build + unit tests + lint + release R8 (needs the SDK)
./gradlew build

# Android screenshot evidence (Robolectric native graphics + Roborazzi), writes PNGs
./gradlew :android-app:recordRoborazziDebug

# iOS (macOS): generate the project, build the framework, run XCTest on a simulator
cd ios-app && xcodegen generate
cd .. && ./gradlew :core:linkDebugFrameworkIosSimulatorArm64 -Pvoysemble.android=false
cd ios-app && xcodebuild test -project Voysemble.xcodeproj -scheme Voysemble \
  -destination 'platform=iOS Simulator,name=<any iPhone from xcrun simctl list>' \
  CODE_SIGNING_ALLOWED=NO
```

The Xcode pre-build script runs `./gradlew :core:embedAndSignAppleFrameworkForXcode` and reads
`VOYSEMBLE_ANDROID` (default `true`); export `VOYSEMBLE_ANDROID=false` on a Mac without the
Android SDK.

## 4. Test tiers and what each proves

| Tier | Where | Runner | Proves |
|---|---|---|---|
| Core JVM | `core/src/commonTest` | `kotlin.test` + coroutines-test + Ktor `MockEngine` | Domain rules and API client behaviour, including wire JSON and headers |
| Android unit | `android-app/src/test` (`*ViewModelTest`) | JUnit 4 + `kotlin.test` asserts, `Dispatchers.setMain(UnconfinedTestDispatcher())` | View model state transitions and safe error messages |
| Android screenshot | `android-app/src/test` (`*ScreenshotTest`) | Robolectric `GraphicsMode.NATIVE`, sdk 35, `w412dp-h915dp`, Roborazzi | Every screen state renders; PNG evidence in `docs/captures/android/` |
| iOS unit | `ios-app/VoysembleTests` | XCTest on the simulator | Swift code compiles against the framework; Kotlin models behave the same from Swift (`CoreModelsTests`) |
| iOS screenshot | `ios-app/VoysembleTests/CaptureTests.swift` | XCTest on the simulator: each view hosted in a `UIHostingController` inside a `UIWindow` on the test host's scene, drawn with `drawHierarchy`, 393x852 at 2x | Every screen state renders; PNG evidence in `docs/captures/ios/` (D31) |

Test naming: Kotlin tests use `snake_case` names that state the fact; the file header lists
the facts the file proves. Android unit tests use `org.junit.Test` (JUnit bridge for
`kotlin.test` is only on the classpath via `kotlin("test-junit")`).

## 5. CI

`.github/workflows/ci.yml`:

- `mobile` (ubuntu): `./gradlew build` then `:android-app:recordRoborazziDebug`; uploads
  `android-captures` (PNGs) and `mobile-test-reports`.
- `ios` (`macos-15`): picks an available iPhone simulator by UDID (downloads the iOS platform
  if none), XcodeGen, warm framework link, `xcodebuild test`; uploads `ios-build-log` and
  `ios-captures` (PNGs from `CaptureTests`).
- `captures` (ubuntu, after `web`, `mobile` and `ios` all passed, push events only): downloads
  `web-captures`, `android-captures` and `ios-captures`, and commits any change under
  `docs/captures/` to the branch as `chore(captures): record device captures for <sha> [skip ci]`
  (D31). The commit never triggers CI. Pull with rebase before pushing from a workstation or the
  authoring sandbox, since the branch may have moved by one captures commit.

Never write the literal skip marker (`[skip ci]`, `[ci skip]`) in a human commit message, not
even to describe the captures commit: GitHub skips the run for any push whose head commit message
contains it, which is how slice 022 went unverified until the next push.

Artifacts live on GitHub's blob storage (`*.blob.core.windows.net`), which the authoring sandbox
cannot reach; the `captures` job is what brings the PNGs into the repo.

## 6. Adding a screen: checklist

1. Model and transitions in `core` (`commonMain`), fixture in `KoreaConcertTourFixture`, JVM test.
2. Android: `*ViewModel.kt` (state holder only), `*Screen.kt` (render), route in
   `AppNavigation.kt`. Reuse `ui/Widgets.kt` (VyCard, ScreenHeader, LabelChip, SyncChip,
   SampleDataChip). A fixture-backed screen shows `SampleDataChip`.
3. Android tests: a `*ScreenshotTest` with at least light, dark, and one non-default state;
   a `*ViewModelTest` when the view model has logic.
4. iOS: `*View.swift` with an `ObservableObject` model over the same core functions; add a
   case to `CoreModelsTests` when new core functions are called from Swift, and a capture of
   each new screen state to `CaptureTests` (D31).
5. `feature-status.json`: `simulated` for fixture screens, `working` once the screen reads
   the API with tests proving it.
6. `docs/captures/README.md` and `mobile/README.md` screen table; slice entry in
   `docs/planning/slices.md` with the CI run id once green.

## 7. Rules learned from CI (keep)

Compose and Android:
- Never construct a ViewModel inside `setContent {}` (Android Lint `ViewModelConstructorInComposable`); hoist it.
- `onNodeWithText(...).assertExists()` fails when two nodes match; use `onAllNodesWithText(...).assertCountEquals(n)`.
- View model actions that launch coroutines return their `Job`; tests `.join()` before asserting (Ktor hops dispatchers).
- `kotlin.test.Test` is unresolved in Android unit tests; use `org.junit.Test`.
- Compose BOM 2026.09 requires `compileSdk` 37 (`android.suppressUnsupportedCompileSdk=37`).
- Robolectric `createComposeRule` deprecation warnings are known; migrate to the v2 rule in one pass when Roborazzi supports it.

Wire JSON (kotlinx.serialization in `ApiClient`):
- Nulls and defaults are encoded (`encodeDefaults = true`, `explicitNulls` default). Zod on the server
  treats a missing nullable key as invalid (`closedAtDevice`) and a missing defaulted key as its server
  default (`client` → web, no session token). Request DTOs therefore never carry `= null` defaults on
  fields the server must see.
- Every nullable response-DTO field carries `= null` so an absent key still decodes.
- A test that asserts a request body must cover the null case, not only the populated one; CI run
  38112192499 is the one that caught the omitted `closedAtDevice`.

Swift and the Kotlin framework (SKIE):
- Kotlin top-level extension functions are Swift members: `session.close(atDevice:)`, not `HeadcountModelKt.close(...)`.
- Kotlin enums are Swift enums: `switch mark { case .present: ... }`, not `onEnum(of:)` (that is for sealed classes).
- Nested classes export flat: `SessionStateAwaitingLink`, `ApiResultFailed`.
- Never name a Kotlin or generated Swift type `Type`; the token generator emits `Typography`.
- Kotlin objects are `.shared` (`KoreaConcertTourFixture.shared`), companions are `.companion`.
- Suspend functions are `async throws`; the project is in Swift 5 language mode because framework types are not `Sendable`.
- A Kotlin property named `self` is renamed; we use `me`.

Gradle:
- Plugins are precompiled convention plugins in `build-logic` and `build-logic-android`; the Android one is only included when `voysemble.android=true`.
- The root build applies `id("voysemble.kmp") apply false` so KGP and AGP load once.
- Maven Central rate-limits (HTTP 429) in some sandboxes; retry.

## 8. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `dl.google.com` denied | no Google Maven on the host | `-Pvoysemble.android=false` |
| `Unable to find a device matching ... iPhone 16` | simulator names differ per Xcode | pick by UDID (`xcrun simctl list devices available -j`) |
| `type member must not be named 'Type'` | generated tokens | regenerate: `pnpm --filter @voysemble/design-tokens build` |
| `cannot find 'XxxKt' in scope` | calling a Kotlin extension through the file facade | call it as a member |
| `non-sendable result type` errors | Swift 6 strict concurrency | project is Swift 5 mode; do not raise it |
| Lint `ViewModelConstructorInComposable` | VM built inside `setContent` | hoist |
| `Expected exactly 1 node but found N` | duplicate text on screen | `onAllNodesWithText` |
