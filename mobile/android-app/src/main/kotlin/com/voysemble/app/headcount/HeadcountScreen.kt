// Copyright 2026- At Day. All rights reserved.
//
// Leader head count (atlas #15, D14, D25). Missing list pinned at the top with one-tap actions
// (call, push "come now", mark with other group, excuse), then the full roster where a tap toggles
// present. "Pending sync" is explicit. Closing with missing members is allowed and labelled.

package com.voysemble.app.headcount

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
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
import com.voysemble.app.ui.SyncChip
import com.voysemble.app.ui.VyCard
import com.voysemble.core.headcount.HeadcountMark
import com.voysemble.core.headcount.HeadcountMember
import com.voysemble.core.headcount.HeadcountSession
import com.voysemble.core.headcount.SyncState
import com.voysemble.core.window.WindowState

@Composable
fun HeadcountRoute(vm: HeadcountViewModel, onBack: () -> Unit) {
    val session by vm.state.collectAsStateWithLifecycle()
    HeadcountScreen(
        session = session,
        onToggle = vm::togglePresent,
        onExcuse = vm::excuse,
        onWithOtherGroup = vm::withOtherGroup,
        onClose = vm::close,
        onBack = onBack,
    )
}

@Composable
fun HeadcountScreen(
    session: HeadcountSession,
    onToggle: (String) -> Unit,
    onExcuse: (String) -> Unit,
    onWithOtherGroup: (String) -> Unit,
    onClose: () -> Unit,
    onBack: () -> Unit,
) {
    val c = LocalVoysembleColors.current
    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        bottomBar = { CloseBar(session, onClose) },
    ) { padding ->
        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(padding),
            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item {
                ScreenHeader(
                    eyebrow = "Head count · ${session.groupLabel}",
                    title = "${session.presentCount} / ${session.expected}",
                    subtitle = "Opened ${session.openedAtDevice} by ${session.openedBy}" +
                        (session.closedAtDevice?.let { " · closed $it" } ?: ""),
                    onBack = onBack,
                ) {
                    Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        SampleDataChip()
                        SyncChip(pending = session.syncState == SyncState.PENDING)
                    }
                }
            }
            item {
                LinearProgressIndicator(
                    progress = { if (session.expected == 0) 0f else session.accountedCount.toFloat() / session.expected },
                    modifier = Modifier.fillMaxWidth().height(8.dp),
                    color = if (session.missing.isEmpty()) c.success else c.warning,
                    trackColor = c.border,
                )
            }
            if (session.missing.isNotEmpty()) {
                item { SectionLabel("${session.missing.size} missing") }
                items(session.missing, key = { "m-${it.id}" }) { m ->
                    MissingCard(m, session.markOf(m.id), session.isClosed, onToggle, onExcuse, onWithOtherGroup)
                }
            } else {
                item {
                    VyCard {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Icon(AppIcons.Check, contentDescription = null, tint = c.success)
                            Text("Everyone accounted for", style = MaterialTheme.typography.titleMedium)
                        }
                    }
                }
            }
            item { SectionLabel("Roster · tap to mark present") }
            item {
                VyCard {
                    session.members.forEachIndexed { i, m ->
                        RosterRow(m, session.markOf(m.id), enabled = !session.isClosed, onToggle = onToggle)
                        if (i < session.members.lastIndex) Box(Modifier.fillMaxWidth().height(1.dp).background(c.border))
                    }
                }
            }
        }
    }
}

@Composable
private fun MissingCard(
    m: HeadcountMember,
    mark: HeadcountMark,
    closed: Boolean,
    onToggle: (String) -> Unit,
    onExcuse: (String) -> Unit,
    onWithOtherGroup: (String) -> Unit,
) {
    val c = LocalVoysembleColors.current
    VyCard {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Initials(m.name)
            Column(Modifier.weight(1f)) {
                Text(m.name, style = MaterialTheme.typography.titleMedium)
                Text(
                    listOfNotNull(
                        m.room?.let { "Room $it" },
                        m.lastAckAt?.let { "last ack $it" } ?: "no ack today",
                        m.windowState?.let { windowLabel(it) },
                    ).joinToString(" · "),
                    style = MaterialTheme.typography.bodyMedium,
                    color = c.textMuted,
                )
            }
            LabelChip(if (mark == HeadcountMark.MISSING) "Missing" else "Not marked", c.danger)
        }
        if (!closed) {
            Spacer(Modifier.height(10.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(onClick = {}, shape = MaterialTheme.shapes.small, contentPadding = PaddingValues(horizontal = 12.dp)) {
                    Icon(AppIcons.Phone, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(6.dp))
                    Text("Call")
                }
                OutlinedButton(onClick = {}, shape = MaterialTheme.shapes.small, contentPadding = PaddingValues(horizontal = 12.dp)) {
                    Icon(AppIcons.Bell, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(6.dp))
                    Text("Come now")
                }
            }
            Spacer(Modifier.height(6.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(
                    onClick = { onToggle(m.id) },
                    colors = ButtonDefaults.buttonColors(containerColor = c.action, contentColor = c.onAction),
                    shape = MaterialTheme.shapes.small,
                    contentPadding = PaddingValues(horizontal = 12.dp),
                ) { Text("Present") }
                OutlinedButton(onClick = { onWithOtherGroup(m.id) }, shape = MaterialTheme.shapes.small, contentPadding = PaddingValues(horizontal = 12.dp)) { Text("Other group") }
                OutlinedButton(onClick = { onExcuse(m.id) }, shape = MaterialTheme.shapes.small, contentPadding = PaddingValues(horizontal = 12.dp)) { Text("Excuse") }
            }
        }
    }
}

@Composable
private fun RosterRow(m: HeadcountMember, mark: HeadcountMark, enabled: Boolean, onToggle: (String) -> Unit) {
    val c = LocalVoysembleColors.current
    val (label, color) = when (mark) {
        HeadcountMark.PRESENT -> "Present" to c.success
        HeadcountMark.MISSING -> "Missing" to c.danger
        HeadcountMark.WITH_OTHER_GROUP -> "Other group" to c.info
        HeadcountMark.EXCUSED -> "Excused" to c.textMuted
        HeadcountMark.UNMARKED -> "Not marked" to c.warning
    }
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        modifier = Modifier
            .fillMaxWidth()
            .clickable(enabled = enabled) { onToggle(m.id) }
            .padding(vertical = 8.dp)
            .semantics { contentDescription = "${m.name}: $label" },
    ) {
        Box(
            Modifier.size(22.dp).background(if (mark == HeadcountMark.PRESENT) c.success else c.border, CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            if (mark == HeadcountMark.PRESENT) Icon(AppIcons.Check, contentDescription = null, tint = c.onAction, modifier = Modifier.size(14.dp))
        }
        Text(m.name, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(1f))
        m.room?.let { Text("Rm $it", style = MaterialTheme.typography.bodyMedium, color = c.textMuted) }
        LabelChip(label, color)
    }
}

@Composable
private fun CloseBar(session: HeadcountSession, onClose: () -> Unit) {
    val c = LocalVoysembleColors.current
    Row(
        modifier = Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.surface).padding(16.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Column(Modifier.weight(1f)) {
            Text(
                "${session.accountedCount} of ${session.expected} accounted for",
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.SemiBold,
            )
            Text(
                when {
                    session.closedWithMissing -> "Closed with ${session.missing.size} missing · incident opened"
                    session.isClosed -> "Closed"
                    session.missing.isNotEmpty() -> "Closing now marks ${session.missing.size} as missing"
                    else -> "Ready to close"
                },
                style = MaterialTheme.typography.bodyMedium,
                color = if (session.closedWithMissing) c.danger else c.textMuted,
            )
        }
        Button(
            onClick = onClose,
            enabled = !session.isClosed,
            colors = ButtonDefaults.buttonColors(containerColor = c.action, contentColor = c.onAction),
            shape = MaterialTheme.shapes.small,
        ) { Text(if (session.isClosed) "Closed" else "Close head count") }
    }
}

@Composable
private fun Initials(name: String) {
    val c = LocalVoysembleColors.current
    val initials = name.split(" ").mapNotNull { it.firstOrNull() }.take(2).joinToString("")
    Box(Modifier.size(36.dp).background(c.info.copy(alpha = 0.15f), CircleShape), contentAlignment = Alignment.Center) {
        Text(initials, style = MaterialTheme.typography.labelSmall, color = c.info, fontWeight = FontWeight.Bold)
    }
}

internal fun windowLabel(state: WindowState): String = when (state) {
    WindowState.INSIDE -> "inside zone"
    WindowState.OUTSIDE -> "outside zone"
    WindowState.UNCERTAIN -> "location uncertain"
    WindowState.STALE -> "location stale"
    WindowState.OPTED_OUT -> "not sharing"
}
