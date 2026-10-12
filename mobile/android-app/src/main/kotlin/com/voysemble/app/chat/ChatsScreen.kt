// Copyright 2026- At Day. All rights reserved.
//
// Chats tab (D22, slice 033): the fixed channels with unread badges, and one thread with a
// composer. Bubbles: mine on the right in the action colour; others on the left with the name.
// Pending shows "Sending…", failed shows "Not sent · tap to retry".

package com.voysemble.app.chat

import com.voysemble.core.i18n.Txt
import com.voysemble.core.i18n.tr
import com.voysemble.core.i18n.trf
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
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
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
import com.voysemble.core.chat.ChatChannel
import com.voysemble.core.chat.ChatMessage
import com.voysemble.core.chat.ChatThread
import com.voysemble.core.chat.unreadTotal

@Composable
fun ChatsRoute(vm: ChatsViewModel) {
    val state by vm.state.collectAsStateWithLifecycle()
    val open = state.open
    if (open == null) {
        ChannelList(state, onOpen = { vm.open(it) })
    } else {
        ThreadScreen(open, live = state.live, syncing = state.syncing, error = state.error, onBack = vm::close, onSend = { vm.send(it) }, onRetry = { vm.retry(it) })
    }
}

@Composable
fun ChannelList(state: ChatsUiState, onOpen: (String) -> Unit) {
    val c = LocalVoysembleColors.current
    val unread = state.channels.unreadTotal()
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        item {
            ScreenHeader(
                eyebrow = tr(Txt.CHAT_EYEBROW),
                title = if (unread == 0) tr(Txt.CHAT_CAUGHT_UP) else trf(Txt.CHAT_UNREAD, unread),
                subtitle = tr(Txt.CHAT_RULE),
                onBack = null,
            ) { if (!state.live) SampleDataChip() else LabelChip(if (state.syncing) tr(Txt.COMMON_SYNCING) else tr(Txt.COMMON_LIVE), c.info, AppIcons.Check) }
        }
        state.error?.let { item { Text(it, style = MaterialTheme.typography.bodyMedium, color = c.danger) } }
        if (state.channels.isEmpty() && state.live && !state.syncing) {
            item { Text(tr(Txt.CHAT_NONE), style = MaterialTheme.typography.bodyMedium, color = c.textMuted) }
        }
        items(state.channels, key = { it.id }) { ch -> ChannelRow(ch, onOpen) }
    }
}

@Composable
private fun ChannelRow(ch: ChatChannel, onOpen: (String) -> Unit) {
    val c = LocalVoysembleColors.current
    VyCard(
        Modifier
            .clickable { onOpen(ch.id) }
            .semantics { contentDescription = trf(Txt.CHAT_OPEN_SPOKEN, ch.title) },
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Box(Modifier.size(36.dp).background(c.action.copy(alpha = 0.12f), CircleShape), contentAlignment = Alignment.Center) {
                Icon(
                    when (ch.kind) { "trip" -> AppIcons.People; "group" -> AppIcons.Bus; else -> AppIcons.Chat },
                    contentDescription = null,
                    tint = c.action,
                    modifier = Modifier.size(18.dp),
                )
            }
            Column(Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(ch.title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                    if (ch.unread > 0) LabelChip(trf(Txt.CHAT_NEW, ch.unread), c.action)
                }
                Text(ch.lastPreview ?: ch.subtitle, style = MaterialTheme.typography.bodyMedium, color = c.textMuted, maxLines = 1)
            }
            ch.lastAt?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = c.textMuted) }
        }
    }
}

@Composable
fun ThreadScreen(
    thread: ChatThread,
    live: Boolean,
    syncing: Boolean,
    error: String?,
    onBack: () -> Unit,
    onSend: (String) -> Unit,
    onRetry: (String) -> Unit,
) {
    val c = LocalVoysembleColors.current
    var draft by remember { mutableStateOf("") }
    Column(Modifier.fillMaxSize()) {
        LazyColumn(
            modifier = Modifier.weight(1f).fillMaxWidth(),
            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            item {
                ScreenHeader(eyebrow = tr(Txt.CHAT_ONE), title = thread.channel.title, subtitle = thread.channel.subtitle, onBack = onBack) {
                    if (!live) SampleDataChip() else LabelChip(if (syncing) tr(Txt.COMMON_SYNCING) else if (thread.offline) tr(Txt.COMMON_OFFLINE) else tr(Txt.COMMON_LIVE), if (thread.offline) c.warning else c.info, AppIcons.Check)
                }
            }
            error?.let { item { Text(it, style = MaterialTheme.typography.bodyMedium, color = c.danger) } }
            if (thread.messages.isEmpty()) {
                item { Text(tr(Txt.CHAT_NO_MESSAGES), style = MaterialTheme.typography.bodyMedium, color = c.textMuted) }
            }
            items(thread.messages, key = { it.id }) { m -> Bubble(m, onRetry) }
        }
        Row(
            modifier = Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.surface).padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            OutlinedTextField(
                value = draft,
                onValueChange = { draft = it.take(1000) },
                placeholder = { Text(tr(Txt.CHAT_MESSAGE)) },
                modifier = Modifier.weight(1f).semantics { contentDescription = tr(Txt.CHAT_MESSAGE) },
                maxLines = 4,
            )
            Button(
                onClick = { onSend(draft); draft = "" },
                enabled = draft.isNotBlank(),
                colors = ButtonDefaults.buttonColors(containerColor = c.action, contentColor = c.onAction),
                shape = MaterialTheme.shapes.small,
            ) { Text(tr(Txt.COMMON_SEND)) }
        }
    }
}

@Composable
private fun Bubble(m: ChatMessage, onRetry: (String) -> Unit) {
    val c = LocalVoysembleColors.current
    Row(Modifier.fillMaxWidth(), horizontalArrangement = if (m.mine) Arrangement.End else Arrangement.Start) {
        Column(
            Modifier
                .widthIn(max = 300.dp)
                .background(if (m.mine) c.action else c.surfaceRaised, RoundedCornerShape(14.dp))
                .then(if (m.failed) Modifier.clickable { onRetry(m.id) } else Modifier)
                .padding(horizontal = 12.dp, vertical = 8.dp),
        ) {
            if (!m.mine) Text(m.senderName, style = MaterialTheme.typography.labelSmall, color = c.textMuted)
            Text(m.body, style = MaterialTheme.typography.bodyLarge, color = if (m.mine) c.onAction else MaterialTheme.colorScheme.onSurface)
            Spacer(Modifier.height(2.dp))
            Text(
                when {
                    m.failed -> tr(Txt.CHAT_NOT_SENT)
                    m.pending -> tr(Txt.CHAT_SENDING)
                    else -> m.sentAt
                },
                style = MaterialTheme.typography.labelSmall,
                color = if (m.failed) c.danger else if (m.mine) c.onAction.copy(alpha = 0.8f) else c.textMuted,
            )
        }
    }
    Spacer(Modifier.width(0.dp))
}
