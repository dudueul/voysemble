// Copyright 2026- At Day. All rights reserved.
// Plan tab (slice 035): the whole published itinerary, one day at a time. Day chips across the
// top, the day's events in the organizer's order with the Today row, and for leaders the D24
// affordances: "Propose a change" on an event (change or remove) and "Propose an event" in the
// day header (add). The same bottom bar as Today; the view model owns the state. For leaders
// the day ends with its bookings (slice 047, D37): the flights that touch the day, the hotel of
// the night and every bus with its roster seats; never the driver's contact.

package com.voysemble.app.plan

import com.voysemble.core.i18n.Txt
import com.voysemble.core.i18n.tr
import com.voysemble.core.i18n.trf
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.voysemble.app.today.EventRow
import com.voysemble.app.today.ProposalState
import com.voysemble.app.today.ProposalTarget
import com.voysemble.app.today.ProposeChangeDialog
import com.voysemble.app.ui.AppIcons
import com.voysemble.app.ui.LabelChip
import com.voysemble.app.ui.LocalVoysembleColors
import com.voysemble.app.ui.SampleDataChip
import com.voysemble.app.ui.ScreenHeader
import com.voysemble.app.ui.SectionLabel
import com.voysemble.core.plan.PlanDay
import com.voysemble.core.plan.proposalSentMessage
import com.voysemble.core.plan.revisionLine
import com.voysemble.core.travel.DayTravel
import com.voysemble.core.travel.bookingsOn
import com.voysemble.core.travel.detail
import com.voysemble.core.travel.flightStatusLabel
import com.voysemble.core.travel.isQuiet
import com.voysemble.core.travel.title

@Composable
fun PlanRoute(vm: PlanViewModel) {
    val state by vm.state.collectAsStateWithLifecycle()
    var proposing by remember { mutableStateOf<ProposalTarget?>(null) }
    proposing?.let { target ->
        ProposeChangeDialog(
            target = target,
            onDismiss = { proposing = null },
            onSend = { draft ->
                vm.propose(draft)
                proposing = null
            },
        )
    }
    PlanScreen(state, onSelectDay = vm::selectDay, onPropose = { proposing = it }, onDismissProposal = vm::dismissProposal)
}

@Composable
fun PlanScreen(
    state: PlanUiState,
    onSelectDay: (Int) -> Unit,
    onPropose: (ProposalTarget) -> Unit = {},
    onDismissProposal: () -> Unit = {},
) {
    val c = LocalVoysembleColors.current
    val plan = state.plan
    val day = plan.days.getOrNull(state.selected)
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            ScreenHeader(
                eyebrow = plan.tripName,
                title = tr(Txt.PLAN_TITLE),
                subtitle = plan.revisionLine() + when (val m = plan.minutesSinceSync) {
                    null -> ""
                    0 -> " · " + tr(Txt.COMMON_SYNCED_JUST_NOW)
                    else -> " · " + trf(Txt.COMMON_SYNCED_MIN_AGO, m)
                },
                onBack = null,
            ) { if (!state.live) SampleDataChip() else LabelChip(if (state.syncing) tr(Txt.COMMON_SYNCING) else tr(Txt.COMMON_LIVE), c.info, AppIcons.Check) }
        }
        state.error?.let { item { Text(it, style = MaterialTheme.typography.bodyMedium, color = c.danger) } }
        if (plan.offline) {
            item {
                Row(
                    modifier = Modifier.fillMaxWidth().background(c.warning.copy(alpha = 0.14f), MaterialTheme.shapes.small).padding(12.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(AppIcons.Offline, contentDescription = null, tint = c.warning, modifier = Modifier.size(18.dp))
                    Text(tr(Txt.COMMON_OFFLINE_LAST_PLAN), style = MaterialTheme.typography.bodyMedium, color = c.warning)
                }
            }
        }
        if (plan.days.isEmpty()) {
            item {
                Text(
                    if (state.live && state.syncing) tr(Txt.PLAN_LOADING) else tr(Txt.PLAN_NONE),
                    style = MaterialTheme.typography.bodyMedium,
                    color = c.textMuted,
                )
            }
        } else {
            item { DayChips(plan.days, state.selected, onSelectDay) }
        }
        if (day != null) {
            item {
                // The add affordance sits in the day header so a long day never hides it (CI run 38244949195).
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(day.label, style = MaterialTheme.typography.titleLarge)
                        Text(trf(Txt.PLAN_DAY_META, day.dateLabel, day.timeZoneLabel, day.dayNumber), style = MaterialTheme.typography.bodyMedium, color = c.textMuted)
                    }
                    if (state.canPropose) {
                        OutlinedButton(onClick = { onPropose(ProposalTarget.forDay(day)) }, enabled = state.proposal?.sending != true, shape = MaterialTheme.shapes.small) {
                            Text(tr(Txt.PLAN_PROPOSE_EVENT))
                        }
                    }
                }
            }
            state.proposal?.let { p -> item { ProposalLine(p, onDismissProposal) } }
            if (day.events.isEmpty()) {
                item { Text(tr(Txt.PLAN_NOTHING), style = MaterialTheme.typography.bodyMedium, color = c.textMuted) }
            }
            items(day.events, key = { it.id }) { e ->
                Column {
                    EventRow(e)
                    if (state.canPropose) {
                        TextButton(
                            onClick = { onPropose(ProposalTarget.forEvent(e, day.label, day.date, day.timeZone)) },
                            enabled = state.proposal?.sending != true,
                            modifier = Modifier.semantics { contentDescription = trf(Txt.PLAN_PROPOSE_CHANGE_SPOKEN, e.title) },
                        ) { Text(tr(Txt.TODAY_PROPOSE_CHANGE)) }
                    }
                }
            }
            state.travel?.let { travel -> bookings(travel.bookingsOn(day.date)) }
        }
        item { Spacer(Modifier.height(8.dp)) }
    }
}

/** The day's bookings (D37): flights, the hotel of the night, every bus. Keys carry a prefix so they never meet an event id. */
private fun androidx.compose.foundation.lazy.LazyListScope.bookings(onDay: DayTravel) {
    item { SectionLabel(tr(Txt.TRAVEL_SECTION)) }
    item { HintText(tr(Txt.TRAVEL_HINT)) }
    if (onDay.isQuiet()) item { HintText(tr(Txt.TRAVEL_QUIET)) }
    items(onDay.flights, key = { "fl-${it.id}" }) { f ->
        BookingRow(AppIcons.Plane, f.title(), f.detail(), spoken = trf(Txt.TRAVEL_FLIGHT_SPOKEN, f.code), status = f.status)
    }
    items(onDay.hotels, key = { "ho-${it.hotel.id}" }) { h ->
        BookingRow(AppIcons.Hotel, h.hotel.name, h.detail(), spoken = trf(Txt.TRAVEL_HOTEL_SPOKEN, h.hotel.name))
    }
    items(onDay.buses, key = { "bu-${it.id}" }) { b ->
        BookingRow(AppIcons.Bus, b.label, b.detail(), spoken = trf(Txt.TRAVEL_BUS_SPOKEN, b.label))
    }
}

@Composable
private fun HintText(text: String) {
    Text(text, style = MaterialTheme.typography.bodySmall, color = LocalVoysembleColors.current.textMuted)
}

@Composable
private fun BookingRow(icon: ImageVector, title: String, detail: String, spoken: String, status: String? = null) {
    val c = LocalVoysembleColors.current
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier.size(36.dp).background(c.surfaceRaised, RoundedCornerShape(10.dp)).border(1.dp, c.border, RoundedCornerShape(10.dp)),
            contentAlignment = Alignment.Center,
        ) { Icon(icon, contentDescription = spoken, tint = c.textMuted, modifier = Modifier.size(18.dp)) }
        Column(Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold)
            Text(detail, style = MaterialTheme.typography.bodyMedium, color = c.textMuted)
        }
        status?.let { LabelChip(flightStatusLabel(it), flightStatusTint(it, c.textMuted, c.warning, c.danger, c.success)) }
    }
}

private fun flightStatusTint(status: String, muted: Color, warning: Color, danger: Color, success: Color): Color = when (status) {
    "delayed" -> warning
    "cancelled" -> danger
    "done" -> success
    else -> muted
}

@Composable
private fun DayChips(days: List<PlanDay>, selected: Int, onSelect: (Int) -> Unit) {
    LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        items(days.indices.toList(), key = { days[it].date }) { i ->
            val d = days[i]
            FilterChip(
                selected = i == selected,
                onClick = { onSelect(i) },
                label = { Text(trf(Txt.PLAN_DAY_CHIP, d.dayNumber, d.label)) },
                modifier = Modifier.semantics { contentDescription = trf(Txt.PLAN_OPEN_DAY_SPOKEN, d.label, d.dateLabel) },
            )
        }
    }
}

/** The result of the last proposal, with OK to clear it. */
@Composable
private fun ProposalLine(p: ProposalState, onDismiss: () -> Unit) {
    val c = LocalVoysembleColors.current
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(
            when {
                p.sending -> tr(Txt.TODAY_SENDING_PROPOSAL)
                p.sent -> proposalSentMessage(p.kind)
                else -> p.error ?: tr(Txt.PROPOSAL_FAILED_GENERIC)
            },
            style = MaterialTheme.typography.bodyMedium,
            color = if (p.sent || p.sending) c.success else c.warning,
            modifier = Modifier.weight(1f),
        )
        if (!p.sending) TextButton(onClick = onDismiss) { Text(tr(Txt.COMMON_OK)) }
    }
}
