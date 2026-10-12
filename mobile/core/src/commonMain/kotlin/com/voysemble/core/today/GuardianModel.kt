// Copyright 2026- At Day. All rights reserved.
//
// The guardian's card on Today (D13, slice 025), shared by Android and iOS: one headline, one
// detail line and an optional leader-confirmed message, in the reader's language. Pure rules over
// the wire status; the apps only render. Tone drives the colour: calm (nothing happening yet),
// good (counted, confirmed), attention (missing, open incident). Slice 080: a traveler's own help
// request and a card opened by hand show while open, before any message; the words stay with
// the traveler and the organizer (D13).

package com.voysemble.core.today

import com.voysemble.core.api.GuardianFeeDto
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
    /** The fee line (D23): the balance and due date, or "paid in full"; null until a fee is set. */
    val balance: String? = null,
)

/** Minor units in the currency's own format without platform formatters: ₩450,000, $120.50, €0.00, ¥1,500. */
public fun formatMinor(minor: Long, currency: String): String {
    val exponent = if (currency == "KRW" || currency == "JPY") 0 else 2
    val symbol = when (currency) { "KRW" -> "₩"; "USD" -> "$"; "EUR" -> "€"; "JPY" -> "¥"; else -> "$currency " }
    val divisor = if (exponent == 0) 1L else 100L
    val major = minor / divisor
    val cents = (minor % divisor).toString().padStart(exponent, '0')
    val grouped = major.toString().reversed().chunked(3).joinToString(",").reversed()
    return if (exponent == 0) "$symbol$grouped" else "$symbol$grouped.$cents"
}

/** The fee line for the guardian card in the reader's language. */
public fun feeLineOf(fee: GuardianFeeDto, locale: String): String {
    val ko = locale == "ko"
    return when (fee.status) {
        "paid" -> if (ko) "납부 완료" else "Paid in full"
        "refunded" -> if (ko) "${formatMinor(fee.refundedMinor, fee.currency)} 환불됨" else "${formatMinor(fee.refundedMinor, fee.currency)} refunded"
        else -> {
            val amount = formatMinor(fee.balanceMinor, fee.currency)
            val due = fee.dueOn?.let { if (ko) " · ${it}까지" else " · due $it" } ?: ""
            if (ko) "잔액 $amount$due" else "Balance $amount$due"
        }
    }
}

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
    val balance = status.fee?.let { feeLineOf(it, locale) }
    return cardWithoutFee(status, locale, clock, t, c, group, where, incident, message, resolved).copy(balance = balance)
}

private fun cardWithoutFee(
    status: GuardianStatusDto,
    locale: String,
    clock: (iso: String) -> String,
    t: com.voysemble.core.api.GuardianTravelerDto,
    c: com.voysemble.core.api.GuardianCountDto,
    group: String,
    where: String,
    incident: com.voysemble.core.api.GuardianIncidentDto?,
    message: String?,
    resolved: Boolean,
): GuardianCard {
    val ko = locale == "ko"
    return when {
        message != null -> GuardianCard(
            t.displayName, t.groupName,
            headline = if (ko) "인솔자의 확인 소식" else "Update from the leaders",
            detail = if (ko) "${clock(incident?.openedAt ?: "")}에 열린 확인 요청" else "Opened at ${clock(incident?.openedAt ?: "")}",
            tone = if (resolved) GuardianTone.GOOD else GuardianTone.ATTENTION,
            message = message,
        )
        incident != null && incident.status == "open" && incident.kind == "help" -> GuardianCard(
            t.displayName, t.groupName,
            headline = if (ko) "${clock(incident.openedAt)}에 도움을 요청했습니다" else "Asked for help at ${clock(incident.openedAt)}",
            detail = if (ko) "인솔자와 주최자가 대응 중입니다. 확인된 소식을 여기서 알려 드립니다." else "The leaders and the organizer are on it. You will get a confirmed update here.",
            tone = GuardianTone.ATTENTION,
            message = null,
        )
        incident != null && incident.status == "open" && incident.kind == "manual" -> GuardianCard(
            t.displayName, t.groupName,
            headline = if (ko) "${clock(incident.openedAt)}부터 열린 사건이 있습니다" else "An incident is open since ${clock(incident.openedAt)}",
            detail = if (ko) "인솔자가 확인 중입니다. 확인된 소식을 여기서 알려 드립니다." else "The leaders are checking. You will get a confirmed update here.",
            tone = GuardianTone.ATTENTION,
            message = null,
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
