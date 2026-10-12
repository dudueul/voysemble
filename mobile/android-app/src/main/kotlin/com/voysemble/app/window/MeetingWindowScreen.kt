// Copyright 2026- At Day. All rights reserved.
//
// Meeting window (atlas #7 map & radius, D15). Schematic map: the zone circle, members by state,
// legend with counts. No tiles, no coordinates. The traveler's only control is the sharing switch
// for this window; it stops automatically at the end time. Live (slice 029): the window comes
// from the API, the switch asks for location permission once, and the chip reads "Live".

package com.voysemble.app.window

import com.voysemble.core.i18n.Txt
import com.voysemble.core.i18n.tr
import com.voysemble.core.i18n.trf
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Canvas
import androidx.compose.runtime.setValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.mutableStateOf
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Button
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.rememberScrollState
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
import androidx.compose.ui.platform.LocalContext
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

/** Live/sample status for the header chip and the error line; the default is the fixture. */
data class WindowScreenStatus(
    val live: Boolean = false,
    val syncing: Boolean = false,
    val error: String? = null,
    /** A leader may open a window here and close the current one (slice 032). */
    val canOpen: Boolean = false,
    val ownGroup: String? = null,
    val opening: Boolean = false,
)

/** What the leader typed into the open form; the meeting point is the phone's fix. */
data class WindowDraft(val label: String, val place: String, val radiusMeters: Int, val minutes: Int, val groups: List<String>)

@Composable
fun MeetingWindowRoute(vm: MeetingWindowViewModel, onBack: () -> Unit) {
    val state by vm.state.collectAsStateWithLifecycle()
    val context = LocalContext.current
    // The switch asks for location once; whatever the answer, the person chose to share, and a
    // device without permission reports "uncertain" (never a position).
    // One launcher serves both asks: the traveler's switch and the leader's "open here".
    var pendingDraft by remember { mutableStateOf<WindowDraft?>(null) }
    val permissions = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {
        val d = pendingDraft
        pendingDraft = null
        if (d == null) vm.setSharing(true) else vm.openWindow(d.label, d.place, d.radiusMeters, d.minutes, d.groups)
    }
    MeetingWindowScreen(
        window = state.window,
        now = state.now,
        status = WindowScreenStatus(live = state.live, syncing = state.syncing, error = state.error, canOpen = state.canOpen, ownGroup = state.ownGroup, opening = state.opening),
        onSharingChange = { on ->
            if (on && state.live && !hasLocationPermission(context)) permissions.launch(AndroidLocationSource.PERMISSIONS) else vm.setSharing(on)
        },
        onBack = onBack,
        onOpenWindow = { d ->
            if (hasLocationPermission(context)) {
                vm.openWindow(d.label, d.place, d.radiusMeters, d.minutes, d.groups)
            } else {
                pendingDraft = d
                permissions.launch(AndroidLocationSource.PERMISSIONS)
            }
        },
        onCloseWindow = { vm.closeWindow() },
    )
}

@Composable
fun MeetingWindowScreen(
    window: MeetingWindow?,
    now: String,
    onSharingChange: (Boolean) -> Unit,
    onBack: () -> Unit,
    status: WindowScreenStatus = WindowScreenStatus(),
    onOpenWindow: (WindowDraft) -> Unit = {},
    onCloseWindow: () -> Unit = {},
) {
    val c = LocalVoysembleColors.current
    if (window == null) {
        NoWindow(status, onBack, onOpenWindow)
        return
    }
    val open = window.isOpenAt(now)
    val minutesLeft = window.minutesLeftAt(now)
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            ScreenHeader(
                eyebrow = tr(Txt.WIN_EYEBROW),
                title = window.label,
                subtitle = trf(Txt.WIN_META, window.place, window.radiusMeters, window.startsAt, window.endsAt),
                onBack = onBack,
            ) { StatusChip(status) }
        }
        status.error?.let { item { Text(it, style = MaterialTheme.typography.bodyMedium, color = c.danger) } }
        if (status.canOpen && open) {
            item {
                OutlinedButton(onClick = onCloseWindow, shape = MaterialTheme.shapes.small) { Text(tr(Txt.WIN_CLOSE_NOW)) }
            }
        }
        item {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                if (open) LabelChip(trf(Txt.WIN_OPEN_LEFT, minutesLeft), c.success, AppIcons.Clock) else LabelChip(tr(Txt.WIN_CLOSED), c.textMuted, AppIcons.Clock)
                Text(trf(Txt.WIN_OPENED_BY, window.openedBy), style = MaterialTheme.typography.bodyMedium, color = c.textMuted)
            }
        }
        item { SchematicMap(window) }
        item { Legend(window) }
        if (window.selfId != null) {
            item {
                VyCard {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        Column(Modifier.weight(1f)) {
                            Text(tr(Txt.WIN_SHARE_TITLE), style = MaterialTheme.typography.titleMedium)
                            Text(
                                if (window.selfOptedIn) trf(Txt.WIN_SHARING_UNTIL, window.endsAt) else tr(Txt.WIN_SHARE_HINT),
                                style = MaterialTheme.typography.bodyMedium,
                                color = c.textMuted,
                            )
                        }
                        Switch(
                            checked = window.selfOptedIn,
                            onCheckedChange = onSharingChange,
                            enabled = open,
                            modifier = Modifier.semantics { contentDescription = tr(Txt.WIN_SHARE_SPOKEN) },
                        )
                    }
                    window.me?.let { me ->
                        Spacer(Modifier.height(8.dp))
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            Text(tr(Txt.WIN_YOUR_STATE), style = MaterialTheme.typography.bodyMedium, color = c.textMuted)
                            LabelChip(stateLabel(me.state), stateColor(c, me.state))
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun StatusChip(status: WindowScreenStatus) {
    val c = LocalVoysembleColors.current
    if (!status.live) SampleDataChip() else LabelChip(if (status.syncing) tr(Txt.COMMON_SYNCING) else tr(Txt.COMMON_LIVE), c.info, AppIcons.Check)
}

/** Live mode without an open or scheduled window; a leader gets the form to open one here. */
@Composable
private fun NoWindow(status: WindowScreenStatus, onBack: () -> Unit, onOpenWindow: (WindowDraft) -> Unit) {
    val c = LocalVoysembleColors.current
    Column(
        modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        ScreenHeader(eyebrow = tr(Txt.WIN_EYEBROW), title = tr(Txt.WIN_NONE_TITLE), subtitle = null, onBack = onBack) { StatusChip(status) }
        status.error?.let { Text(it, style = MaterialTheme.typography.bodyMedium, color = c.danger) }
        VyCard {
            Text(tr(Txt.WIN_NONE_BODY), style = MaterialTheme.typography.titleMedium)
            Spacer(Modifier.height(4.dp))
            Text(
                if (status.canOpen) tr(Txt.WIN_NONE_LEADER_HINT) else tr(Txt.WIN_NONE_TRAVELER_HINT),
                style = MaterialTheme.typography.bodyMedium,
                color = c.textMuted,
            )
        }
        if (status.canOpen) OpenWindowForm(status, onOpenWindow)
    }
}

/** The leader's form (slice 032): label, place, radius, duration, groups; the point is the phone's fix. */
@Composable
private fun OpenWindowForm(status: WindowScreenStatus, onOpenWindow: (WindowDraft) -> Unit) {
    val c = LocalVoysembleColors.current
    var label by remember { mutableStateOf(tr(Txt.WIN_REGROUP)) }
    var place by remember { mutableStateOf("") }
    var radius by remember { mutableStateOf("200") }
    var minutes by remember { mutableStateOf("30") }
    var groups by remember(status.ownGroup) { mutableStateOf(status.ownGroup ?: "") }
    VyCard {
        SectionLabel(tr(Txt.WIN_FORM_TITLE))
        Spacer(Modifier.height(8.dp))
        OutlinedTextField(value = label, onValueChange = { label = it }, label = { Text(tr(Txt.WIN_LABEL)) }, singleLine = true, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(value = place, onValueChange = { place = it }, label = { Text(tr(Txt.WIN_PLACE)) }, singleLine = true, modifier = Modifier.fillMaxWidth())
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedTextField(value = radius, onValueChange = { radius = it.filter(Char::isDigit) }, label = { Text(tr(Txt.WIN_RADIUS)) }, singleLine = true, modifier = Modifier.weight(1f))
            OutlinedTextField(value = minutes, onValueChange = { minutes = it.filter(Char::isDigit) }, label = { Text(tr(Txt.WIN_MINUTES)) }, singleLine = true, modifier = Modifier.weight(1f))
        }
        OutlinedTextField(value = groups, onValueChange = { groups = it }, label = { Text(tr(Txt.WIN_GROUPS)) }, singleLine = true, modifier = Modifier.fillMaxWidth())
        Spacer(Modifier.height(8.dp))
        Button(
            onClick = { onOpenWindow(WindowDraft(label, place, radius.toIntOrNull() ?: 200, minutes.toIntOrNull() ?: 30, groups.split(','))) },
            enabled = !status.opening,
            colors = ButtonDefaults.buttonColors(containerColor = c.action, contentColor = c.onAction),
            shape = MaterialTheme.shapes.small,
        ) { Text(if (status.opening) tr(Txt.WIN_OPENING) else tr(Txt.WIN_OPEN_HERE)) }
        Spacer(Modifier.height(4.dp))
        Text(tr(Txt.WIN_FORM_HINT), style = MaterialTheme.typography.bodySmall, color = c.textMuted)
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
            .semantics { contentDescription = trf(Txt.WIN_MAP_SPOKEN, window.insideCount, window.sharingCount) },
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
        SectionLabel(tr(Txt.WIN_TRAVELERS))
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
    WindowState.INSIDE -> tr(Txt.WIN_STATE_INSIDE)
    WindowState.OUTSIDE -> tr(Txt.WIN_STATE_OUTSIDE)
    WindowState.UNCERTAIN -> tr(Txt.WIN_STATE_UNCERTAIN)
    WindowState.STALE -> tr(Txt.WIN_STATE_STALE)
    WindowState.OPTED_OUT -> tr(Txt.WIN_STATE_NOT_SHARING)
}
