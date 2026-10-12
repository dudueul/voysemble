// Copyright 2026- At Day. All rights reserved.
// The phones' text in the app's language (slice 039): thin Swift names over the core table
// (core/i18n/L10n.kt), so a screen reads `tr(.todayTitle)` on iOS as `tr(Txt.TODAY_TITLE)` on
// Android. The language is set once at launch (VoysembleApp) from the device; the capture test
// sets it to Korean for the Korean pictures.

import VoysembleCore

func tr(_ id: Txt) -> String { L10nKt.tr(id: id) }
func tr1(_ id: Txt, _ a: Any?) -> String { L10nKt.tr1(id: id, a: a) }
func tr2(_ id: Txt, _ a: Any?, _ b: Any?) -> String { L10nKt.tr2(id: id, a: a, b: b) }
func tr3(_ id: Txt, _ a: Any?, _ b: Any?, _ c: Any?) -> String { L10nKt.tr3(id: id, a: a, b: b, c: c) }
func tr4(_ id: Txt, _ a: Any?, _ b: Any?, _ c: Any?, _ d: Any?) -> String { L10nKt.tr4(id: id, a: a, b: b, c: c, d: d) }
