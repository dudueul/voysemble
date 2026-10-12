// Copyright 2026- At Day. All rights reserved.
// Plan tab (slice 035): the whole published itinerary, one day at a time. Day chips across the
// top, the day's events in the organizer's order with the Today row, and for leaders the D24
// affordances: "Propose a change" on an event (change or remove) and "Propose an event" in the
// day header (add). The same bottom bar as Today; the view model owns the state.

package com.voysemble.app.plan

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
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
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
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
import com.voysemble.core.plan.PlanDay
import com.voysemble.core.plan.proposalSentMessage
import com.voysemble.core.plan.revisionLine

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
                title = "Plan",
                subtitle = plan.revisionLine() + when (val m = plan.minutesSinceSync) {
                    null -> ""
                    0 -> " · Synced just now"
                    else -> " · Synced $m min ago"
                },
                onBack = null,
            ) { if (!state.live) SampleDataChip() else LabelChip(if (state.syncing) "Syncing" else "Live", c.info, AppIcons.Check) }
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
                    Text("Offline. Showing the last synced plan.", style = MaterialTheme.typography.bodyMedium, color = c.warning)
                }
            }
        }
        if (plan.days.isEmpty()) {
            item {
                Text(
                    if (state.live && state.syncing) "Loading the plan…" else "No published plan yet. The organizer publishes it from the console.",
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
                        Text("${day.dateLabel} · ${day.timeZoneLabel} · Day ${day.dayNumber}", style = MaterialTheme.typography.bodyMedium, color = c.textMuted)
                    }
                    if (state.canPropose) {
                        OutlinedButton(onClick = { onPropose(ProposalTarget.forDay(day)) }, enabled = state.proposal?.sending != true, shape = MaterialTheme.shapes.small) {
                            Text("Propose an event")
                        }
                    }
                }
            }
            state.proposal?.let { p -> item { ProposalLine(p, onDismissProposal) } }
            if (day.events.isEmpty()) {
                item { Text("Nothing planned for this day yet.", style = MaterialTheme.typography.bodyMedium, color = c.textMuted) }
            }
            items(day.events, key = { it.id }) { e ->
                Column {
                    EventRow(e)
                    if (state.canPropose) {
                        TextButton(
                            onClick = { onPropose(ProposalTarget.forEvent(e, day.label, day.date, day.timeZone)) },
                            enabled = state.proposal?.sending != true,
                            modifier = Modifier.semantics { contentDescription = "Propose a change to ${e.title}" },
                        ) { Text("Propose a change") }
                    }
                }
            }
        }
        item { Spacer(Modifier.height(8.dp)) }
    }
}

@Composable
private fun DayChips(days: List<PlanDay>, selected: Int, onSelect: (Int) -> Unit) {
    LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        items(days.indices.toList(), key = { days[it].date }) { i ->
            val d = days[i]
            FilterChip(
                selected = i == selected,
                onClick = { onSelect(i) },
                label = { Text("D${d.dayNumber} · ${d.label}") },
                modifier = Modifier.semantics { contentDescription = "Open ${d.label}, ${d.dateLabel}" },
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
                p.sending -> "Sending proposal…"
                p.sent -> proposalSentMessage(p.kind)
                else -> p.error ?: "Could not send the proposal."
            },
            style = MaterialTheme.typography.bodyMedium,
            color = if (p.sent || p.sending) c.success else c.warning,
            modifier = Modifier.weight(1f),
        )
        if (!p.sending) TextButton(onClick = onDismiss) { Text("OK") }
    }
}
