// Copyright 2026- At Day. All rights reserved.
// Notification inbox screen (D29, slice 053): the unread count, the lane rule in a line, one row
// per notification with its lane, kind and time, the title and the short body; a tap on an unread
// row marks it read. Reached from the bell in the Today header. What arrives here is the server's
// decision; the phone shows and reads, nothing more.

package com.voysemble.app.notifications

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import com.voysemble.app.ui.VyCard
import com.voysemble.core.i18n.Txt
import com.voysemble.core.i18n.tr
import com.voysemble.core.notifications.InboxItem
import com.voysemble.core.notifications.Lane
import com.voysemble.core.notifications.kindLabel
import com.voysemble.core.notifications.laneLabel
import com.voysemble.core.notifications.spoken
import com.voysemble.core.notifications.summary

@Composable
fun InboxRoute(vm: InboxViewModel, onBack: () -> Unit) {
    val state by vm.state.collectAsStateWithLifecycle()
    InboxScreen(state, onRead = { vm.markRead(it) }, onBack = onBack)
}

@Composable
fun InboxScreen(state: InboxUiState, onRead: (String) -> Unit, onBack: (() -> Unit)?) {
    val c = LocalVoysembleColors.current
    val inbox = state.inbox
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            ScreenHeader(
                eyebrow = tr(Txt.INBOX_EYEBROW),
                title = tr(Txt.INBOX_TITLE),
                subtitle = inbox.summary(),
                onBack = onBack,
            ) { if (!state.live) SampleDataChip() else LabelChip(if (state.syncing) tr(Txt.COMMON_SYNCING) else tr(Txt.COMMON_LIVE), c.info, AppIcons.Check) }
        }
        state.error?.let { item { Text(it, style = MaterialTheme.typography.bodyMedium, color = c.danger) } }
        state.notice?.let { item { Text(it, style = MaterialTheme.typography.bodyMedium, color = c.warning) } }
        item { Text(tr(Txt.INBOX_HINT), style = MaterialTheme.typography.bodySmall, color = c.textMuted) }
        if (inbox.items.isEmpty() && !state.syncing) {
            item { Text(tr(Txt.INBOX_NONE), style = MaterialTheme.typography.bodyMedium, color = c.textMuted) }
        }
        items(inbox.items, key = { it.id }) { item ->
            InboxRow(item, pending = item.id in state.pending, onRead = { onRead(item.id) })
        }
        item { Text(tr(Txt.INBOX_PUSH_NOTE), style = MaterialTheme.typography.bodySmall, color = c.textMuted) }
        item { Spacer(Modifier.height(8.dp)) }
    }
}

@Composable
private fun InboxRow(item: InboxItem, pending: Boolean, onRead: () -> Unit) {
    val c = LocalVoysembleColors.current
    val laneColor = when (item.lane) {
        Lane.PRIORITY -> c.danger
        Lane.NORMAL -> c.info
        Lane.DIGEST -> c.textMuted
    }
    val spoken = item.spoken()
    VyCard(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(enabled = !item.read && !pending, onClick = onRead)
            .semantics { contentDescription = spoken },
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            LabelChip(laneLabel(item.lane), laneColor)
            Text("${kindLabel(item.kind)} · ${item.deliveredAt}", style = MaterialTheme.typography.labelSmall, color = c.textMuted)
            Spacer(Modifier.weight(1f))
            if (!item.read) Box(Modifier.size(8.dp).background(c.action, CircleShape))
        }
        Spacer(Modifier.height(6.dp))
        Text(
            item.title,
            style = MaterialTheme.typography.bodyLarge,
            fontWeight = if (item.read) FontWeight.Normal else FontWeight.SemiBold,
            color = if (item.read) c.textMuted else MaterialTheme.colorScheme.onSurface,
        )
        if (item.body.isNotBlank()) Text(item.body, style = MaterialTheme.typography.bodySmall, color = c.textMuted)
        if (!item.read) {
            Row(horizontalArrangement = Arrangement.End, modifier = Modifier.fillMaxWidth()) {
                Spacer(Modifier.width(1.dp))
                TextButton(onClick = onRead, enabled = !pending) { Text(tr(Txt.INBOX_MARK_READ)) }
            }
        }
    }
}
