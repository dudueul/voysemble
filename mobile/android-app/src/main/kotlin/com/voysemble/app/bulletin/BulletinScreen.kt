// Copyright 2026- At Day. All rights reserved.
//
// Bulletin & acknowledgments (atlas #9, D16). Required-ack items first, one tap "Got it" that
// queues offline, original text always shown with the machine translation labelled underneath.

package com.voysemble.app.bulletin

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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.voysemble.app.ui.AppIcons
import com.voysemble.app.ui.LabelChip
import com.voysemble.app.ui.LocalVoysembleColors
import com.voysemble.app.ui.SampleDataChip
import com.voysemble.app.ui.ScreenHeader
import com.voysemble.app.ui.VyCard
import com.voysemble.core.announcements.AnnouncementFeed
import com.voysemble.core.announcements.AnnouncementItem
import com.voysemble.core.today.AckState

@Composable
fun BulletinRoute(vm: BulletinViewModel, tripName: String? = null, onSignOut: () -> Unit = {}) {
    val state by vm.state.collectAsStateWithLifecycle()
    BulletinScreen(
        feed = state.feed,
        live = state.live,
        syncing = state.syncing,
        tripName = tripName,
        onAcknowledge = vm::acknowledge,
        onRefresh = vm::refresh,
        onSignOut = onSignOut,
    )
}

@Composable
fun BulletinScreen(
    feed: AnnouncementFeed,
    onAcknowledge: (String) -> Unit,
    live: Boolean = false,
    syncing: Boolean = false,
    tripName: String? = null,
    onRefresh: () -> Unit = {},
    onSignOut: () -> Unit = {},
) {
    val c = LocalVoysembleColors.current
    val sorted = feed.items.sortedWith(compareBy({ !(it.requiresAck && it.ack == AckState.UNACKNOWLEDGED) }))
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            ScreenHeader(
                eyebrow = tripName ?: "Korea Concert Tour",
                title = "Bulletin",
                subtitle = when (val n = feed.unackedRequired.size) {
                    0 -> if (live && feed.items.isEmpty() && !syncing) "No announcements yet" else "Nothing waiting for you"
                    1 -> "1 update needs your acknowledgment"
                    else -> "$n updates need your acknowledgment"
                },
                onBack = null,
            ) {
                if (live) {
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                        if (syncing) LabelChip("Syncing", c.textMuted, AppIcons.Sync) else LabelChip("Live", c.success, AppIcons.Sync)
                        TextButton(onClick = onRefresh) { Text("Refresh") }
                        TextButton(onClick = onSignOut) { Text("Sign out") }
                    }
                } else {
                    SampleDataChip()
                }
            }
        }
        if (feed.offline) {
            item {
                Row(
                    modifier = Modifier.fillMaxWidth().background(c.warning.copy(alpha = 0.14f), MaterialTheme.shapes.small).padding(12.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(AppIcons.Offline, contentDescription = null, tint = c.warning, modifier = Modifier.size(18.dp))
                    Text("Offline. Acknowledgments send when you are back online.", style = MaterialTheme.typography.bodyMedium, color = c.warning)
                }
            }
        }
        items(sorted, key = { it.id }) { a -> AnnouncementRow(a, onAcknowledge) }
    }
}

@Composable
private fun AnnouncementRow(a: AnnouncementItem, onAcknowledge: (String) -> Unit) {
    val c = LocalVoysembleColors.current
    VyCard {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Text("${a.author} · ${a.publishedAt}", style = MaterialTheme.typography.labelSmall, color = c.textMuted, modifier = Modifier.weight(1f))
            if (a.requiresAck) LabelChip("Ack required", if (a.ack == AckState.UNACKNOWLEDGED) c.warning else c.textMuted)
            if (a.sharedWithGuardians) LabelChip("Parents", c.info, AppIcons.People)
        }
        Spacer(Modifier.height(6.dp))
        if (a.isRevision) {
            LabelChip("Itinerary update · rev ${a.revisionNumber ?: "?"}", c.info, AppIcons.Plan)
            Spacer(Modifier.height(4.dp))
        }
        Text(a.title, style = MaterialTheme.typography.titleMedium)
        Spacer(Modifier.height(2.dp))
        Text(a.body, style = MaterialTheme.typography.bodyLarge)
        if (a.changeLines.isNotEmpty()) {
            // D19: the diff, line by line; a full re-plan collapses after ten lines.
            Spacer(Modifier.height(6.dp))
            Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                a.changeLines.take(10).forEach { line -> Text("• $line", style = MaterialTheme.typography.bodyMedium) }
                if (a.changeLines.size > 10) Text("and ${a.changeLines.size - 10} more", style = MaterialTheme.typography.bodyMedium, color = c.textMuted)
            }
        }
        a.machineTranslation?.let { t ->
            Spacer(Modifier.height(8.dp))
            Column(
                Modifier.fillMaxWidth().background(c.border.copy(alpha = 0.35f), MaterialTheme.shapes.small).padding(10.dp),
                verticalArrangement = Arrangement.spacedBy(2.dp),
            ) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    Icon(AppIcons.Translate, contentDescription = null, tint = c.textMuted, modifier = Modifier.size(14.dp))
                    Text(a.translationLabel ?: "Machine translation", style = MaterialTheme.typography.labelSmall, color = c.textMuted)
                }
                Text(t, style = MaterialTheme.typography.bodyMedium)
            }
        }
        if (a.requiresAck) {
            Spacer(Modifier.height(10.dp))
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                when (a.ack) {
                    AckState.UNACKNOWLEDGED -> Button(
                        onClick = { onAcknowledge(a.id) },
                        colors = ButtonDefaults.buttonColors(containerColor = c.action, contentColor = c.onAction),
                        shape = MaterialTheme.shapes.small,
                    ) { Text("Got it") }
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
                Text("${a.acknowledgedCount}/${a.totalCount}", style = MaterialTheme.typography.bodyMedium, color = c.textMuted)
            }
        }
    }
}
