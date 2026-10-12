// Copyright 2026- At Day. All rights reserved.
//
// The guardian's card on Today (D13, slice 025), shared by Android and iOS: one headline, one
// detail line and an optional leader-confirmed message, in the reader's language. Pure rules over
// the wire status; the apps only render. Tone drives the colour: calm (nothing happening yet),
// good (counted, confirmed), attention (missing, open incident).

package com.voysemble.core.today

import com.voysemble.core.api.GuardianStatusDto

public enum class GuardianTone { CALM, GOOD, ATTENTION }

public data class GuardianCard(
    val travelerName: String,
    val groupName: String?,
    val headline: String,
    val detail: String,
    val tone: GuardianTone,
    /** The organizer's guardian message, once sent, in the reader's language. */
    val message: String?,
)

/** `clock` renders an ISO instant as local HH:mm (incident open time); `locale` is "ko" or "en". */
public fun guardianCardOf(status: GuardianStatusDto, locale: String = "en", clock: (iso: String) -> String = { it }): GuardianCard {
    val ko = locale == "ko"
    val t = status.traveler
    val c = status.count
    val group = c.groupLabel ?: t.groupName ?: (if (ko) "전체" else "Whole trip")
    val where = listOfNotNull(group, c.atDevice, c.byName?.let { if (ko) "$it 인솔자" else "by $it" }).joinToString(" · ")
    val incident = status.incident
    val message = incident?.message?.let { if (ko) it.bodyKo else it.bodyEn }
    val resolved = incident?.status == "resolved"
    return when {
        message != null -> GuardianCard(
            t.displayName, t.groupName,
            headline = if (ko) "인솔자의 확인 소식" else "Update from the leaders",
            detail = if (ko) "${clock(incident.openedAt)}에 열린 확인 요청" else "Opened at ${clock(incident.openedAt)}",
            tone = if (resolved) GuardianTone.GOOD else GuardianTone.ATTENTION,
            message = message,
        )
        c.status == "missing" -> GuardianCard(
            t.displayName, t.groupName,
            headline = if (ko) "${c.atDevice ?: ""} 인원 점검에서 미확인" else "Missing at the ${c.atDevice ?: ""} count",
            detail = if (ko) "인솔자가 확인 중입니다. 확인된 소식을 여기서 알려 드립니다." else "The leaders are checking. You will get a confirmed update here.",
            tone = GuardianTone.ATTENTION,
            message = null,
        )
        c.status == "present" -> GuardianCard(t.displayName, t.groupName, if (ko) "출석 확인됨" else "Counted present", where, GuardianTone.GOOD, null)
        c.status == "with_other_group" -> GuardianCard(t.displayName, t.groupName, if (ko) "다른 조와 함께" else "With another group", where, GuardianTone.GOOD, null)
        c.status == "excused" -> GuardianCard(t.displayName, t.groupName, if (ko) "사유 있음" else "Excused", where, GuardianTone.GOOD, null)
        else -> GuardianCard(
            t.displayName, t.groupName,
            headline = if (ko) "아직 인원 점검 전입니다" else "Not counted yet today",
            detail = if (ko) "인솔자가 아직 $group 인원 점검을 시작하지 않았습니다." else "The leader has not opened a head count for $group yet.",
            tone = GuardianTone.CALM,
            message = null,
        )
    }
}
