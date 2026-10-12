// Copyright 2026- At Day. All rights reserved.
// Rooming list screen (D41, slice 059): the hotel, the summary, one section per room with the
// names in it (leaders in bold), then who has no room yet. Read-only: the organizer places
// people on the console. Reached from a hotel row on the Plan tab by a leader.

package com.voysemble.app.plan

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
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
import com.voysemble.core.i18n.Txt
import com.voysemble.core.i18n.tr
import com.voysemble.core.travel.RoomGroup
import com.voysemble.core.travel.byRoom
import com.voysemble.core.travel.roomLabel
import com.voysemble.core.travel.spoken
import com.voysemble.core.travel.summary
import com.voysemble.core.travel.unassigned

@Composable
fun RoomingRoute(vm: RoomingViewModel, onBack: () -> Unit) {
    val state by vm.state.collectAsStateWithLifecycle()
    RoomingScreen(state, onBack = onBack)
}

@Composable
fun RoomingScreen(state: RoomingUiState, onBack: (() -> Unit)?) {
    val c = LocalVoysembleColors.current
    val r = state.rooming
    val rooms = r.byRoom()
    val unassigned = r.unassigned()
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            ScreenHeader(
                eyebrow = tr(Txt.ROOMING_EYEBROW),
                title = r.hotelName,
                subtitle = r.summary(),
                onBack = onBack,
            ) { if (!state.live) SampleDataChip() else LabelChip(if (state.syncing) tr(Txt.COMMON_SYNCING) else tr(Txt.COMMON_LIVE), c.info, AppIcons.Check) }
        }
        state.error?.let { item { Text(it, style = MaterialTheme.typography.bodyMedium, color = c.danger) } }
        item { Text(tr(Txt.ROOMING_HINT), style = MaterialTheme.typography.bodySmall, color = c.textMuted) }
        if (rooms.isEmpty() && !state.syncing) {
            item { Text(tr(Txt.ROOMING_NONE), style = MaterialTheme.typography.bodyMedium, color = c.textMuted) }
        }
        items(rooms, key = { "room-${it.room}" }) { room -> RoomCard(room, leaders = r.people.filter { it.leader }.map { it.name }.toSet()) }
        if (unassigned.isNotEmpty()) {
            item { SectionLabel(tr(Txt.ROOMING_UNASSIGNED)) }
            items(unassigned, key = { "un-$it" }) { name ->
                val spoken = r.people.firstOrNull { it.name == name }?.spoken() ?: name
                Text(name, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.semantics { contentDescription = spoken }.padding(vertical = 4.dp))
            }
        }
        item { Spacer(Modifier.height(8.dp)) }
    }
}

@Composable
private fun RoomCard(room: RoomGroup, leaders: Set<String>) {
    val c = LocalVoysembleColors.current
    VyCard(modifier = Modifier.fillMaxWidth()) {
        Text(roomLabel(room.room), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
        Spacer(Modifier.height(4.dp))
        Column {
            room.names.forEach { name ->
                Text(
                    name,
                    style = MaterialTheme.typography.bodyLarge,
                    fontWeight = if (name in leaders) FontWeight.SemiBold else FontWeight.Normal,
                    color = if (name in leaders) MaterialTheme.colorScheme.onSurface else c.textMuted,
                    modifier = Modifier.padding(vertical = 2.dp),
                )
            }
        }
    }
}
