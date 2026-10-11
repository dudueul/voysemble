// Copyright 2026- At Day. All rights reserved.
//
// Meeting window (atlas #7 map & radius, D15). Schematic map: the zone circle, members by state,
// legend with counts. No tiles, no coordinates. The traveler's only control is the sharing switch
// for this window; it stops automatically at the end time.

package com.voysemble.app.window

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.voysemble.app.ui.AppIcons
import com.voysemble.app.ui.LabelChip
import com.voysemble.app.ui.LocalVoysembleColors
import com.voysemble.app.ui.VoysembleColors
import com.voysemble.app.ui.SampleDataChip
import com.voysemble.app.ui.ScreenHeader
import com.voysemble.app.ui.SectionLabel
import com.voysemble.app.ui.VyCard
import com.voysemble.core.window.MeetingWindow
import com.voysemble.core.window.WindowState

@Composable
fun MeetingWindowRoute(vm: MeetingWindowViewModel, onBack: () -> Unit) {
    val state by vm.state.collectAsStateWithLifecycle()
    MeetingWindowScreen(window = state.window, now = state.now, onSharingChange = vm::setSharing, onBack = onBack)
}

@Composable
fun MeetingWindowScreen(window: MeetingWindow, now: String, onSharingChange: (Boolean) -> Unit, onBack: () -> Unit) {
    val c = LocalVoysembleColors.current
    val open = window.isOpenAt(now)
    val minutesLeft = window.minutesLeftAt(now)
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            ScreenHeader(
                eyebrow = "Meeting window",
                title = window.label,
                subtitle = "${window.place} · ${window.radiusMeters} m zone · ${window.startsAt}–${window.endsAt}",
                onBack = onBack,
            ) { SampleDataChip() }
        }
        item {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                if (open) LabelChip("Open · $minutesLeft min left", c.success, AppIcons.Clock) else LabelChip("Closed", c.textMuted, AppIcons.Clock)
                Text("Opened by ${window.openedBy}", style = MaterialTheme.typography.bodyMedium, color = c.textMuted)
            }
        }
        item { SchematicMap(window) }
        item { Legend(window) }
        if (window.selfId != null) {
            item {
                VyCard {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        Column(Modifier.weight(1f)) {
                            Text("Share my position for this window", style = MaterialTheme.typography.titleMedium)
                            Text(
                                if (window.selfOptedIn) "Sharing with leaders until ${window.endsAt}. Stops automatically." else "Only while this window is open. Leaders see inside/outside, never a track. Guardians never see it.",
                                style = MaterialTheme.typography.bodyMedium,
                                color = c.textMuted,
                            )
                        }
                        Switch(
                            checked = window.selfOptedIn,
                            onCheckedChange = onSharingChange,
                            enabled = open,
                            modifier = Modifier.semantics { contentDescription = "Share my position" },
                        )
                    }
                    window.self?.let { me ->
                        Spacer(Modifier.height(8.dp))
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            Text("Your state:", style = MaterialTheme.typography.bodyMedium, color = c.textMuted)
                            LabelChip(stateLabel(me.state), stateColor(c, me.state))
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun SchematicMap(window: MeetingWindow) {
    val c = LocalVoysembleColors.current
    val brand = MaterialTheme.colorScheme.primary
    val surface = MaterialTheme.colorScheme.surface
    val stateColors = WindowState.entries.associateWith { stateColor(c, it) }
    Box(
        Modifier
            .fillMaxWidth()
            .aspectRatio(1.3f)
            .background(c.surfaceRaised, MaterialTheme.shapes.medium)
            .semantics { contentDescription = "Schematic map: ${window.insideCount} of ${window.sharingCount} sharing travelers inside the zone" },
    ) {
        Canvas(Modifier.fillMaxSize()) {
            val center = Offset(size.width / 2f, size.height / 2f)
            val r = size.minDimension * 0.36f
            // Streets: two soft bands so the zone reads as a place, not a chart.
            drawLine(c.border, Offset(0f, size.height * 0.62f), Offset(size.width, size.height * 0.55f), strokeWidth = 18f, cap = StrokeCap.Round)
            drawLine(c.border, Offset(size.width * 0.34f, 0f), Offset(size.width * 0.42f, size.height), strokeWidth = 14f, cap = StrokeCap.Round)
            drawCircle(brand.copy(alpha = 0.12f), radius = r, center = center)
            drawCircle(brand, radius = r, center = center, style = Stroke(width = 4f))
            drawCircle(brand, radius = 10f, center = center)
            window.members.filter { it.state != WindowState.OPTED_OUT }.forEach { m ->
                val p = Offset(center.x + m.dx * r * 0.9f, center.y + m.dy * r * 0.9f)
                drawCircle(surface, radius = 22f, center = p)
                drawCircle(stateColors.getValue(m.state), radius = 17f, center = p)
            }
        }
        Text(
            window.place,
            style = MaterialTheme.typography.labelSmall,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.align(Alignment.BottomStart).padding(10.dp).background(surface, MaterialTheme.shapes.small).padding(horizontal = 8.dp, vertical = 4.dp),
        )
    }
}

@Composable
private fun Legend(window: MeetingWindow) {
    val c = LocalVoysembleColors.current
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        SectionLabel("Travelers in this window")
        Row(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
            WindowState.entries.forEach { s ->
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    Box(Modifier.size(10.dp).background(stateColor(c, s), CircleShape))
                    Text("${stateLabel(s)} ${window.count(s)}", style = MaterialTheme.typography.bodyMedium)
                }
            }
        }
    }
}

internal fun stateColor(c: VoysembleColors, state: WindowState): Color {
    return when (state) {
        WindowState.INSIDE -> c.success
        WindowState.OUTSIDE -> c.danger
        WindowState.UNCERTAIN -> c.warning
        WindowState.STALE -> c.stale
        WindowState.OPTED_OUT -> c.textMuted
    }
}

internal fun stateLabel(state: WindowState): String = when (state) {
    WindowState.INSIDE -> "Inside"
    WindowState.OUTSIDE -> "Outside"
    WindowState.UNCERTAIN -> "Uncertain"
    WindowState.STALE -> "Stale"
    WindowState.OPTED_OUT -> "Not sharing"
}
