# Phone languages (slice 039)

The product supports Korean and English and nothing else. The phones spoke only English until this
slice; they now speak the device's language, from one table shared by Android and iOS.

## One table in core

`mobile/core/src/commonMain/kotlin/com/voysemble/core/i18n/`:

- `L10n.kt`: `AppLocale` (the app's language, `"ko"` or `"en"`, set once at launch from the device
  language tag and settable by tests), the key enum `Txt` (one entry per user-facing line, grouped by
  screen), and the lookups `tr(id)`, `trf(id, args...)` (placeholders `{0}`, `{1}`, ...), plus
  `tr1`..`tr4` for Swift, which cannot pass a Kotlin vararg comfortably.
- `Tables.kt`: `EN` and `KO`, one `Map<Txt, String>` each.

`L10nTest` proves both tables carry every key with the same number of placeholders, that no Korean
line is still English (product names and symbols aside), that the lookup follows `AppLocale` and
formats in order, and that any language tag resolves to one of the two.

Core's own messages (the proposal draft rule and its outcomes, the plan's revision line, the
confirmation labels, the empty trip name) read the table too, so a view model never carries copy.
The guardian card (`today/GuardianModel.kt`) already took a locale parameter since slice 025 and
keeps it.

## Android

`MainActivity.onCreate` calls `AppLocale.set(resources.configuration.locales[0].toLanguageTag())`.
Screens and view models call `tr(Txt.KEY)` / `trf(Txt.KEY, a, b)` where they had literals; the
bottom bar keeps keys, not text, so it reads the language at render. Roborazzi records `today-ko.png`
and `plan-day-ko.png` with `AppLocale.current = "ko"` (reset after the test); the English tests are
unchanged because the default is English and the process never runs `MainActivity`.

## iOS

`VoysembleApp.init` calls `AppLocale.shared.set(languageTag:)` with the first preferred language.
`Design/L10n.swift` gives the views `tr(.key)`, `tr1`..`tr4`; the Kotlin enum arrives as a Swift enum
with lower-camel cases (`Txt.TODAY_TITLE` is `.todayTitle`). `CaptureTests.testKorean` writes
`today-ko.png` and `plan-day-ko.png` with the language set to Korean and restored after.

## Rules

- Every new line goes into `Txt` and both tables; a missing Korean line fails `L10nTest`.
- Fixture content (the sample trip's event names, places and people) stays as it is in both
  languages: it is data, not copy.
- Clock formats, codes, product names and CSV headers are identical in both tables.

## Not done

A language choice inside the app (the device language decides); plural forms beyond the few lines
that needed them; right-to-left layouts (not a supported language).
