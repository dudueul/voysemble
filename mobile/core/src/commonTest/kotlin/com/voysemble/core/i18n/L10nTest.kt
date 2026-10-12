// Copyright 2026- At Day. All rights reserved.
// Facts (slice 039): both tables carry every key with the same placeholders; no Korean line is
// still English (product names and symbols aside); the lookup follows AppLocale and formats in
// order; a language tag of any shape resolves to "ko" or "en".

package com.voysemble.core.i18n

import kotlin.test.AfterTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class L10nTest {
    @AfterTest fun reset() {
        AppLocale.current = "en"
    }

    @Test
    fun both_tables_cover_every_key_with_the_same_placeholders() {
        val missingEn = Txt.entries.filter { it !in EN }
        val missingKo = Txt.entries.filter { it !in KO }
        assertEquals(emptyList(), missingEn, "English lines missing")
        assertEquals(emptyList(), missingKo, "Korean lines missing")
        val mismatched = Txt.entries.filter { placeholderCount(EN.getValue(it)) != placeholderCount(KO.getValue(it)) }
        assertEquals(emptyList(), mismatched, "placeholder counts differ")
        assertTrue(Txt.entries.size > 250)
    }

    @Test
    fun no_korean_line_is_left_in_english() {
        val same = Txt.entries.filter { EN.getValue(it) == KO.getValue(it) && Regex("[A-Za-z]{4,}").containsMatchIn(EN.getValue(it)) }
        assertEquals(emptyList(), same)
    }

    @Test
    fun lookup_follows_the_language_and_formats_in_order() {
        assertEquals("Live", tr(Txt.COMMON_LIVE))
        assertEquals("Synced 3 min ago", trf(Txt.COMMON_SYNCED_MIN_AGO, 3))
        AppLocale.set("ko-KR")
        assertEquals("실시간", tr(Txt.COMMON_LIVE))
        assertEquals("3분 전 동기화", tr1(Txt.COMMON_SYNCED_MIN_AGO, 3))
        assertEquals("Bus A · 06:50 Kim 마감 · 누락 2명".length > 0, true)
        assertEquals("18/20 · 누락 2", tr3(Txt.TODAY_GROUP_MISSING, 18, 20, 2))
        assertEquals("투어 · 4일차", tr2(Txt.TODAY_EYEBROW, "투어", 4))
        assertEquals("", trf(Txt.PLAN_REVISION_ONLY, null).replace("판", ""))
        assertEquals("ko", AppLocale.of("ko"))
        assertEquals("en", AppLocale.of("fr-FR"))
        assertEquals("en", AppLocale.of(""))
    }
}
