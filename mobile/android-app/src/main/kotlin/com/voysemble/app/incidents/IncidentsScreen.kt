// Copyright 2026- At Day. All rights reserved.
//
// Leader incident cards (D17). Open cards first with three one-tap answers (with the group, not
// with the group, unknown); the latest answer and the guardian message the organizer sent are
// shown on the card. Pending answers are explicit, as acks are on the bulletin.

package com.voysemble.app.incidents

import com.voysemble.core.incidents.labelOfKind
import com.voysemble.core.incidents.IncidentKind
import com.voysemble.core.i18n.Txt
import com.voysemble.core.i18n.tr
import com.voysemble.core.i18n.trf
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.voysemble.app.ui.AppIcons
import com.voysemble.app.ui.LabelChip
import com.voysemble.app.ui.LocalVoysembleColors
import com.voysemble.app.ui.SampleDataChip
import com.voysemble.app.ui.ScreenHeader
import com.voysemble.app.ui.SectionLabel
import com.voysemble.app.ui.VyCard
import com.voysemble.core.incidents.ConfirmationStatus
import com.voysemble.core.incidents.IncidentCard
import com.voysemble.core.incidents.labelOf
import androidx.compose.material3.TextButton
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue

@Composable
fun IncidentsRoute(vm: IncidentsViewModel, onBack: () -> Unit) {
    val state by vm.state.collectAsStateWithLifecycle()
    IncidentsScreen(
        state = state,
        onConfirm = { id, status -> vm.confirm(id, status, null) },
        onBack = onBack,
        canOpen = vm.canOpen,
        onLoadTravelers = { vm.loadTravelers() },
        onOpen = { title, ids -> vm.openIncident(title, ids) },
    )
}

@Composable
fun IncidentsScreen(
    state: IncidentsUiState,
    onConfirm: (String, ConfirmationStatus) -> Unit,
    onBack: () -> Unit,
    /** Slice 073: "New incident" in the header for a leader; the sheet names travelers of their group. */
    canOpen: Boolean = false,
    onLoadTravelers: () -> Unit = {},
    onOpen: (title: String, participationIds: List<String>) -> Unit = { _, _ -> },
) {
    val c = LocalVoysembleColors.current
    var composing by remember { mutableStateOf(false) }
    if (composing) NewIncidentSheet(state.travelers, state.openError, onOpen) { composing = false }
    val open = state.feed.cards.filter { it.isOpen }
    val closed = state.feed.cards.filter { !it.isOpen }
    Scaffold(containerColor = MaterialTheme.colorScheme.background) { padding ->
        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(padding),
            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item {
                ScreenHeader(
                    eyebrow = tr(Txt.INC_EYEBROW),
                    title = if (open.isEmpty()) tr(Txt.INC_NOTHING_OPEN) else trf(Txt.INC_OPEN_COUNT, open.size),
                    subtitle = tr(Txt.INC_SUBTITLE),
                    onBack = onBack,
                ) {
                    Column(horizontalAlignment = androidx.compose.ui.Alignment.End, verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        if (!state.live) SampleDataChip() else LabelChip(if (state.syncing) tr(Txt.COMMON_SYNCING) else tr(Txt.COMMON_LIVE), c.info, AppIcons.Check)
                        if (state.feed.offline) LabelChip(tr(Txt.COMMON_OFFLINE), c.warning, AppIcons.Offline)
                    }
                }
            }
            if (canOpen) {
                item {
                    TextButton(onClick = { onLoadTravelers(); composing = true }, contentPadding = PaddingValues(0.dp)) { Text(tr(Txt.INC_NEW)) }
                }
            }
            state.openError?.let { message -> item { Text(message, style = MaterialTheme.typography.bodyMedium, color = c.danger) } }
            state.error?.let { message -> item { Text(message, style = MaterialTheme.typography.bodyMedium, color = c.danger) } }
            if (open.isEmpty() && closed.isEmpty() && !state.syncing) {
                item { Text(tr(Txt.INC_NONE), style = MaterialTheme.typography.bodyMedium, color = c.textMuted) }
            }
            if (open.isNotEmpty()) item { SectionLabel(tr(Txt.INC_OPEN)) }
            items(open, key = { it.id }) { card -> IncidentRow(card, onConfirm) }
            if (closed.isNotEmpty()) item { SectionLabel(tr(Txt.INC_RESOLVED)) }
            items(closed, key = { it.id }) { card -> IncidentRow(card, onConfirm) }
        }
    }
}

@Composable
private fun IncidentRow(card: IncidentCard, onConfirm: (String, ConfirmationStatus) -> Unit) {
    val c = LocalVoysembleColors.current
    VyCard {
        Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(card.title, style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
            // Slice 079: where the card came from; a traveler's own request stands out.
            LabelChip(labelOfKind(card.kind), if (card.kind == IncidentKind.HELP) c.warning else c.textMuted)
            LabelChip(if (card.isOpen) tr(Txt.INC_OPEN) else tr(Txt.INC_RESOLVED), if (card.isOpen) c.danger else c.success)
        }
        Text(trf(Txt.INC_META, card.people.joinToString(", "), card.openedAt, card.openedBy), style = MaterialTheme.typography.bodyMedium, color = c.textMuted)
        Spacer(Modifier.height(8.dp))
        val latest = card.latest
        if (latest != null) {
            Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                LabelChip(labelOf(latest.status), if (latest.status == ConfirmationStatus.WITH_GROUP) c.success else c.warning)
                Text("${latest.byName} · ${latest.at}", style = MaterialTheme.typography.bodyMedium, color = c.textMuted)
                if (card.pending != null) LabelChip(tr(Txt.COMMON_PENDING_SYNC), c.warning, AppIcons.Clock)
            }
            latest.note?.let { Text(it, style = MaterialTheme.typography.bodyMedium) }
        } else {
            Text(tr(Txt.INC_NOT_CONFIRMED), style = MaterialTheme.typography.bodyMedium, color = c.warning, fontWeight = FontWeight.SemiBold)
        }
        card.guardianMessage?.let { msg ->
            Spacer(Modifier.height(8.dp))
            Column(Modifier.fillMaxWidth().background(c.success.copy(alpha = 0.10f), MaterialTheme.shapes.small).padding(10.dp)) {
                Text(tr(Txt.INC_GUARDIAN_SENT), style = MaterialTheme.typography.labelSmall, color = c.textMuted)
                Text(msg, style = MaterialTheme.typography.bodyMedium)
            }
        }
        if (card.isOpen) {
            Spacer(Modifier.height(10.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(
                    onClick = { onConfirm(card.id, ConfirmationStatus.WITH_GROUP) },
                    colors = ButtonDefaults.buttonColors(containerColor = c.action, contentColor = c.onAction),
                    shape = MaterialTheme.shapes.small,
                    contentPadding = PaddingValues(horizontal = 12.dp),
                ) { Text(tr(Txt.INC_WITH_GROUP)) }
                OutlinedButton(onClick = { onConfirm(card.id, ConfirmationStatus.NOT_WITH_GROUP) }, shape = MaterialTheme.shapes.small, contentPadding = PaddingValues(horizontal = 12.dp)) { Text(tr(Txt.INC_NOT_WITH_GROUP)) }
                Spacer(Modifier.width(0.dp))
                OutlinedButton(onClick = { onConfirm(card.id, ConfirmationStatus.UNKNOWN) }, shape = MaterialTheme.shapes.small, contentPadding = PaddingValues(horizontal = 12.dp)) { Text(tr(Txt.INC_UNKNOWN)) }
            }
        }
    }
}
