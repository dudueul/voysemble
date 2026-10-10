// Copyright 2026- At Day. All rights reserved.
//
// Mobile Today screen (first mobile visual-acceptance view, doc 01 §18.4). Benchmarks screen
// atlas #2: trip header with day + sync state, green "Up next" card, latest announcement with
// acknowledgment, head count, later-today list, five bottom tabs. Status is never color-only.

package com.voysemble.app.today

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.voysemble.app.ui.AppIcons
import com.voysemble.app.ui.LocalVoysembleColors
import com.voysemble.core.today.AckState
import com.voysemble.core.today.EventKind
import com.voysemble.core.today.EventStatus
import com.voysemble.core.today.HeadcountGroup
import com.voysemble.core.today.TodayAnnouncement
import com.voysemble.core.today.TodayEvent
import com.voysemble.core.today.TodaySnapshot

@Composable
fun TodayRoute(vm: TodayViewModel) {
    val state by vm.state.collectAsStateWithLifecycle()
    TodayScreen(state = state, onAcknowledge = vm::acknowledge, onSelectTab = vm::selectTab)
}

@Composable
fun TodayScreen(state: TodayUiState, onAcknowledge: (String) -> Unit, onSelectTab: (MainTab) -> Unit) {
    val snap = state.snapshot
    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        bottomBar = { BottomTabs(selected = state.tab, onSelect = onSelectTab) },
    ) { padding ->
        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(padding),
            contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 16.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            item { Header(snap) }
            if (snap.offline) item { OfflineBanner(snap) }
            snap.upNext?.let { next -> item { UpNextCard(next, snap.timeZoneLabel) } }
            snap.announcement?.let { a -> item { AnnouncementCard(a, onAcknowledge) } }
            item { HeadcountCard(snap.headcount, snap.checkedIn, snap.expected) }
            item { SectionTitle("Later today") }
            items(snap.later, key = { it.id }) { e -> EventRow(e) }
            item { Spacer(Modifier.height(8.dp)) }
        }
    }
}

@Composable
private fun Header(snap: TodaySnapshot) {
    val c = LocalVoysembleColors.current
    Column {
        Text(
            text = "${snap.tripName.uppercase()} · DAY ${snap.dayNumber}",
            style = MaterialTheme.typography.labelSmall,
            color = c.textMuted,
        )
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("Today", style = MaterialTheme.typography.headlineLarge)
            Spacer(Modifier.weight(1f))
            SampleChip()
        }
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Text("${snap.dateLabel} · ${snap.timeZoneLabel}", style = MaterialTheme.typography.bodyMedium, color = c.textMuted)
            Text("·", color = c.textMuted)
            Icon(AppIcons.Sync, contentDescription = null, tint = c.success, modifier = Modifier.size(14.dp))
            Text(
                text = when (val m = snap.minutesSinceSync) {
                    null -> "Not synced yet"
                    0 -> "Synced just now"
                    else -> "Synced $m min ago"
                },
                style = MaterialTheme.typography.bodyMedium,
                color = c.textMuted,
            )
        }
    }
}

@Composable
private fun SampleChip() {
    val c = LocalVoysembleColors.current
    Text(
        "Sample data",
        style = MaterialTheme.typography.labelSmall,
        color = c.pending,
        modifier = Modifier
            .border(1.dp, c.pending.copy(alpha = 0.35f), RoundedCornerShape(999.dp))
            .background(c.pending.copy(alpha = 0.10f), RoundedCornerShape(999.dp))
            .padding(horizontal = 10.dp, vertical = 3.dp),
    )
}

@Composable
private fun OfflineBanner(snap: TodaySnapshot) {
    val c = LocalVoysembleColors.current
    Row(
        modifier = Modifier.fillMaxWidth().background(c.warning.copy(alpha = 0.14f), MaterialTheme.shapes.small).padding(12.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(AppIcons.Offline, contentDescription = null, tint = c.warning, modifier = Modifier.size(18.dp))
        Text("Offline. Showing the last synced plan.", style = MaterialTheme.typography.bodyMedium, color = c.warning)
    }
}

@Composable
private fun UpNextCard(e: TodayEvent, tz: String) {
    val c = LocalVoysembleColors.current
    Surface(
        shape = MaterialTheme.shapes.medium,
        color = c.action,
        contentColor = c.onAction,
        modifier = Modifier.fillMaxWidth().semantics { contentDescription = "Up next: ${e.title} at ${e.start}" },
    ) {
        Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text("UP NEXT", style = MaterialTheme.typography.labelSmall, color = c.onAction.copy(alpha = 0.8f))
            Text(e.title, style = MaterialTheme.typography.titleLarge)
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(
                    text = if (e.end != null) "${e.start} – ${e.end}" else e.start,
                    style = MaterialTheme.typography.headlineLarge,
                )
                Text(tz, style = MaterialTheme.typography.bodyMedium, color = c.onAction.copy(alpha = 0.8f))
            }
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Icon(AppIcons.Pin, contentDescription = null, modifier = Modifier.size(16.dp))
                Text(e.place, style = MaterialTheme.typography.bodyLarge)
            }
            e.note?.let { Text(it, style = MaterialTheme.typography.bodyMedium, color = c.onAction.copy(alpha = 0.85f)) }
            Spacer(Modifier.height(4.dp))
            Button(
                onClick = {},
                colors = ButtonDefaults.buttonColors(containerColor = Color.White.copy(alpha = 0.16f), contentColor = c.onAction),
                shape = MaterialTheme.shapes.small,
            ) {
                Icon(AppIcons.Map, contentDescription = null, modifier = Modifier.size(16.dp))
                Spacer(Modifier.width(8.dp))
                Text(if (e.isMeetingPoint) "Meeting point" else "Directions")
            }
        }
    }
}

@Composable
private fun AnnouncementCard(a: TodayAnnouncement, onAcknowledge: (String) -> Unit) {
    val c = LocalVoysembleColors.current
    Card {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("LATEST UPDATE", style = MaterialTheme.typography.labelSmall, color = c.textMuted)
            Spacer(Modifier.weight(1f))
            Text("${a.author} · ${a.publishedAt}", style = MaterialTheme.typography.bodyMedium, color = c.textMuted)
        }
        Spacer(Modifier.height(6.dp))
        Text(a.title, style = MaterialTheme.typography.titleMedium)
        Spacer(Modifier.height(2.dp))
        Text(a.body, style = MaterialTheme.typography.bodyLarge, color = c.textMuted)
        Spacer(Modifier.height(10.dp))
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            when (a.ack) {
                AckState.UNACKNOWLEDGED -> Button(
                    onClick = { onAcknowledge(a.id) },
                    colors = ButtonDefaults.buttonColors(containerColor = c.action, contentColor = c.onAction),
                    shape = MaterialTheme.shapes.small,
                ) { Text("Acknowledge") }
                AckState.PENDING -> OutlinedButton(onClick = {}, enabled = false, shape = MaterialTheme.shapes.small) {
                    Icon(AppIcons.Clock, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(6.dp))
                    Text("Queued · sends when online")
                }
                AckState.ACKNOWLEDGED -> OutlinedButton(onClick = {}, enabled = false, shape = MaterialTheme.shapes.small) {
                    Icon(AppIcons.Check, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(6.dp))
                    Text("Acknowledged")
                }
            }
            Text("${a.acknowledgedCount}/${a.totalCount} acknowledged", style = MaterialTheme.typography.bodyMedium, color = c.textMuted)
        }
    }
}

@Composable
private fun HeadcountCard(groups: List<HeadcountGroup>, checkedIn: Int, expected: Int) {
    val c = LocalVoysembleColors.current
    Card {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("HEAD COUNT", style = MaterialTheme.typography.labelSmall, color = c.textMuted)
            Spacer(Modifier.weight(1f))
            Text("$checkedIn / $expected checked in", style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold)
        }
        Spacer(Modifier.height(10.dp))
        groups.forEach { g ->
            val short = g.checkedIn < g.expected
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Text(g.label, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.width(48.dp))
                LinearProgressIndicator(
                    progress = { if (g.expected == 0) 0f else g.checkedIn.toFloat() / g.expected },
                    modifier = Modifier.weight(1f).height(8.dp),
                    color = if (short) c.warning else c.action,
                    trackColor = c.border,
                )
                Text(
                    text = if (short) "${g.checkedIn}/${g.expected} · ${g.expected - g.checkedIn} missing" else "${g.checkedIn}/${g.expected}",
                    style = MaterialTheme.typography.bodyMedium,
                )
            }
            Spacer(Modifier.height(6.dp))
        }
    }
}

@Composable
private fun EventRow(e: TodayEvent) {
    val c = LocalVoysembleColors.current
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.width(52.dp)) {
            Text(e.start, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold)
            e.end?.let { Text("– $it", style = MaterialTheme.typography.labelSmall, color = c.textMuted) }
        }
        Box(
            modifier = Modifier.size(36.dp).background(c.surfaceRaised, RoundedCornerShape(10.dp)).border(1.dp, c.border, RoundedCornerShape(10.dp)),
            contentAlignment = Alignment.Center,
        ) { Icon(iconFor(e.kind), contentDescription = null, tint = c.textMuted, modifier = Modifier.size(18.dp)) }
        Column(Modifier.weight(1f)) {
            Text(e.title, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold)
            Text(e.place, style = MaterialTheme.typography.bodyMedium, color = c.textMuted)
            e.note?.let { Text(it, style = MaterialTheme.typography.labelSmall, color = c.warning) }
        }
        StatusChip(e.status)
    }
}

@Composable
private fun StatusChip(status: EventStatus) {
    val c = LocalVoysembleColors.current
    val (label, color) = when (status) {
        EventStatus.SCHEDULED -> "Scheduled" to c.textMuted
        EventStatus.IN_PROGRESS -> "Now" to c.action
        EventStatus.DONE -> "Done" to c.success
        EventStatus.DELAYED -> "Delayed" to c.warning
        EventStatus.CANCELLED -> "Cancelled" to c.danger
    }
    Text(
        label,
        style = MaterialTheme.typography.labelSmall,
        color = color,
        modifier = Modifier.background(color.copy(alpha = 0.12f), RoundedCornerShape(999.dp)).padding(horizontal = 9.dp, vertical = 3.dp),
    )
}

@Composable
private fun SectionTitle(text: String) {
    Text(text, style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 4.dp))
}

@Composable
private fun Card(content: @Composable androidx.compose.foundation.layout.ColumnScope.() -> Unit) {
    val c = LocalVoysembleColors.current
    Surface(
        shape = MaterialTheme.shapes.medium,
        color = MaterialTheme.colorScheme.surface,
        border = androidx.compose.foundation.BorderStroke(1.dp, c.border),
        modifier = Modifier.fillMaxWidth(),
    ) { Column(Modifier.padding(16.dp), content = content) }
}

@Composable
private fun BottomTabs(selected: MainTab, onSelect: (MainTab) -> Unit) {
    val c = LocalVoysembleColors.current
    NavigationBar(containerColor = MaterialTheme.colorScheme.surface) {
        TABS.forEach { (tab, label, icon) ->
            NavigationBarItem(
                selected = tab == selected,
                onClick = { onSelect(tab) },
                icon = { Icon(icon, contentDescription = null) },
                label = { Text(label) },
            )
        }
    }
    // Keep the border token referenced so dark/light both get the hairline from the theme.
    Box(Modifier.height(0.dp).background(c.border))
}

private val TABS: List<Triple<MainTab, String, ImageVector>> = listOf(
    Triple(MainTab.TODAY, "Today", AppIcons.Today),
    Triple(MainTab.PLAN, "Plan", AppIcons.Plan),
    Triple(MainTab.BULLETIN, "Bulletin", AppIcons.Bulletin),
    Triple(MainTab.CHATS, "Chats", AppIcons.Chat),
    Triple(MainTab.MEMORIES, "Memories", AppIcons.Memories),
)

private fun iconFor(kind: EventKind): ImageVector = when (kind) {
    EventKind.FLIGHT -> AppIcons.Plane
    EventKind.BUS -> AppIcons.Bus
    EventKind.MEAL -> AppIcons.Meal
    EventKind.ACTIVITY -> AppIcons.Flag
    EventKind.HOTEL -> AppIcons.Hotel
    EventKind.MEETING -> AppIcons.Pin
    EventKind.FREE -> AppIcons.Today
}

@Composable
private fun CircleDot(color: Color) = Box(Modifier.size(8.dp).background(color, CircleShape))
