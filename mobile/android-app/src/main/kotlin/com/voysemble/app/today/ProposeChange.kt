// Copyright 2026- At Day. All rights reserved.
// The leader's proposal dialog (D24): a change of time or a removal for an existing event, or a
// new event on a day (slice 035). One form for Today's up-next card and the Plan tab; the draft
// rule and the wire shape live in core (plan/ProposalDraft.kt). The organizer decides on the
// console; nothing here edits the itinerary.

package com.voysemble.app.today

import com.voysemble.core.i18n.Txt
import com.voysemble.core.i18n.tr
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import com.voysemble.app.ui.LocalVoysembleColors
import com.voysemble.core.plan.PlanDay
import com.voysemble.core.plan.ProposalDraft
import com.voysemble.core.plan.ProposalKind
import com.voysemble.core.plan.proposalDraftProblem
import com.voysemble.core.today.TodayEvent

/** What the dialog is about: an existing event (change or remove) or a new one on a day (add). */
data class ProposalTarget(
    val kinds: List<ProposalKind>,
    val eventId: String?,
    val eventTitle: String?,
    val dayLabel: String,
    val date: String,
    val timeZone: String,
    val nextOrder: Int,
) {
    companion object {
        /** Change or remove `event`; the day is unknown on Today's card and not needed for either. */
        fun forEvent(event: TodayEvent, dayLabel: String = tr(Txt.PROPOSE_DAY_TODAY), date: String = "", timeZone: String = ""): ProposalTarget =
            ProposalTarget(listOf(ProposalKind.EDIT, ProposalKind.REMOVE), event.id, event.title, dayLabel, date, timeZone, 0)

        /** Add an event after the day's last one. */
        fun forDay(day: PlanDay): ProposalTarget =
            ProposalTarget(listOf(ProposalKind.ADD), null, null, "${day.label} · ${day.dateLabel}", day.date, day.timeZone, day.nextOrder)
    }
}

/** The dialog around the form; the form is separate so the screenshot test renders it flat. */
@Composable
fun ProposeChangeDialog(target: ProposalTarget, onDismiss: () -> Unit, onSend: (ProposalDraft) -> Unit) {
    Dialog(onDismissRequest = onDismiss) {
        Surface(shape = MaterialTheme.shapes.large, color = MaterialTheme.colorScheme.surface, tonalElevation = 2.dp) {
            ProposeChangeForm(target, onSend = onSend, onCancel = onDismiss, modifier = Modifier.padding(20.dp))
        }
    }
}

fun kindLabel(kind: ProposalKind): String = when (kind) {
    ProposalKind.EDIT -> tr(Txt.PROPOSE_CHANGE_TIME)
    ProposalKind.REMOVE -> tr(Txt.PROPOSE_REMOVE)
    ProposalKind.ADD -> tr(Txt.PROPOSE_ADD_EVENT)
}

/** Kind chips (when there is a choice), the fields for that kind, the note, Send and Cancel. */
@Composable
fun ProposeChangeForm(target: ProposalTarget, onSend: (ProposalDraft) -> Unit, onCancel: () -> Unit, modifier: Modifier = Modifier) {
    val c = LocalVoysembleColors.current
    var kind by remember(target) { mutableStateOf(target.kinds.first()) }
    var start by remember(target) { mutableStateOf("") }
    var end by remember(target) { mutableStateOf("") }
    var title by remember(target) { mutableStateOf("") }
    var place by remember(target) { mutableStateOf("") }
    var note by remember(target) { mutableStateOf("") }
    val draft = ProposalDraft(
        kind = kind,
        eventId = target.eventId,
        note = note,
        start = start,
        end = end,
        title = title,
        place = place,
        date = target.date,
        timeZone = target.timeZone,
        order = target.nextOrder,
    )
    val problem = proposalDraftProblem(draft)
    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text(if (kind == ProposalKind.ADD) tr(Txt.PROPOSE_TITLE_EVENT) else tr(Txt.TODAY_PROPOSE_CHANGE), style = MaterialTheme.typography.titleLarge)
        Text(target.eventTitle ?: target.dayLabel, style = MaterialTheme.typography.bodyMedium, color = c.textMuted)
        if (target.kinds.size > 1) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                target.kinds.forEach { k ->
                    FilterChip(selected = kind == k, onClick = { kind = k }, label = { Text(kindLabel(k)) })
                }
            }
        }
        when (kind) {
            ProposalKind.EDIT -> OutlinedTextField(
                value = start,
                onValueChange = { start = it },
                label = { Text(tr(Txt.PROPOSE_NEW_START)) },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            ProposalKind.REMOVE -> Text(tr(Txt.PROPOSE_REMOVE_HINT), style = MaterialTheme.typography.bodyMedium, color = c.textMuted)
            ProposalKind.ADD -> {
                OutlinedTextField(value = title, onValueChange = { title = it }, label = { Text(tr(Txt.PROPOSE_FIELD_TITLE)) }, singleLine = true, modifier = Modifier.fillMaxWidth())
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(value = start, onValueChange = { start = it }, label = { Text(tr(Txt.PROPOSE_FIELD_START)) }, singleLine = true, modifier = Modifier.weight(1f))
                    OutlinedTextField(value = end, onValueChange = { end = it }, label = { Text(tr(Txt.PROPOSE_FIELD_END)) }, singleLine = true, modifier = Modifier.weight(1f))
                }
                OutlinedTextField(value = place, onValueChange = { place = it }, label = { Text(tr(Txt.PROPOSE_FIELD_PLACE)) }, singleLine = true, modifier = Modifier.fillMaxWidth())
            }
        }
        OutlinedTextField(value = note, onValueChange = { note = it }, label = { Text(tr(Txt.PROPOSE_FIELD_WHY)) }, minLines = 2, modifier = Modifier.fillMaxWidth())
        if (problem != null && note.isNotBlank()) Text(problem, style = MaterialTheme.typography.bodySmall, color = c.warning)
        Row {
            Spacer(Modifier.weight(1f))
            TextButton(onClick = onCancel) { Text(tr(Txt.COMMON_CANCEL)) }
            Spacer(Modifier.width(4.dp))
            TextButton(onClick = { onSend(draft) }, enabled = problem == null) { Text(tr(Txt.COMMON_SEND)) }
        }
    }
}
