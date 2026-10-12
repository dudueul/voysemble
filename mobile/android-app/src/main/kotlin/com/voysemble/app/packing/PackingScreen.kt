// Copyright 2026- At Day. All rights reserved.
// Packing checklist screen (D38, slice 048): whose list it is, the count and a progress bar, one
// row per item with a checkbox; a tap flips it. Reached from the Today tab's packing card. The
// organizer's items come from the console; the phone only ticks.

package com.voysemble.app.packing

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.selection.toggleable
import androidx.compose.material3.Checkbox
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.voysemble.app.ui.AppIcons
import com.voysemble.app.ui.LabelChip
import com.voysemble.app.ui.LocalVoysembleColors
import com.voysemble.app.ui.SampleDataChip
import com.voysemble.app.ui.ScreenHeader
import com.voysemble.core.i18n.Txt
import com.voysemble.core.i18n.tr
import com.voysemble.core.i18n.trf
import com.voysemble.core.packing.PackingItem
import com.voysemble.core.packing.packedCount
import com.voysemble.core.packing.summary
import com.voysemble.core.packing.whose

@Composable
fun PackingRoute(vm: PackingViewModel, onBack: () -> Unit) {
    val state by vm.state.collectAsStateWithLifecycle()
    PackingScreen(state, onToggle = { id, packed -> vm.setPacked(id, packed) }, onBack = onBack)
}

@Composable
fun PackingScreen(state: PackingUiState, onToggle: (String, Boolean) -> Unit, onBack: (() -> Unit)?) {
    val c = LocalVoysembleColors.current
    val list = state.list
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            ScreenHeader(
                eyebrow = tr(Txt.PACK_EYEBROW),
                title = list.whose(),
                subtitle = list.summary(),
                onBack = onBack,
            ) { if (!state.live) SampleDataChip() else LabelChip(if (state.syncing) tr(Txt.COMMON_SYNCING) else tr(Txt.COMMON_LIVE), c.info, AppIcons.Check) }
        }
        state.error?.let { item { Text(it, style = MaterialTheme.typography.bodyMedium, color = c.danger) } }
        state.notice?.let { item { Text(it, style = MaterialTheme.typography.bodyMedium, color = c.warning) } }
        item {
            LinearProgressIndicator(
                progress = { if (list.items.isEmpty()) 0f else list.packedCount().toFloat() / list.items.size },
                modifier = Modifier.fillMaxWidth().height(8.dp),
                color = c.action,
                trackColor = c.border,
            )
        }
        item { Text(tr(Txt.PACK_HINT), style = MaterialTheme.typography.bodySmall, color = c.textMuted) }
        if (list.items.isEmpty() && !state.syncing) {
            item { Text(tr(Txt.PACK_NONE), style = MaterialTheme.typography.bodyMedium, color = c.textMuted) }
        }
        items(list.items, key = { it.id }) { item ->
            PackingRow(item, pending = item.id in state.pending, onToggle = { onToggle(item.id, it) })
        }
        item { Spacer(Modifier.height(8.dp)) }
    }
}

@Composable
private fun PackingRow(item: PackingItem, pending: Boolean, onToggle: (Boolean) -> Unit) {
    val c = LocalVoysembleColors.current
    val spoken = if (item.packed) trf(Txt.PACK_PACKED_SPOKEN, item.name) else trf(Txt.PACK_UNPACKED_SPOKEN, item.name)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .toggleable(value = item.packed, enabled = !pending, role = Role.Checkbox, onValueChange = onToggle)
            .semantics { contentDescription = spoken }
            .padding(vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Checkbox(checked = item.packed, onCheckedChange = null, enabled = !pending)
        Column(Modifier.weight(1f)) {
            Text(
                item.name,
                style = MaterialTheme.typography.bodyLarge,
                fontWeight = FontWeight.SemiBold,
                textDecoration = if (item.packed) TextDecoration.LineThrough else null,
                color = if (item.packed) c.textMuted else MaterialTheme.colorScheme.onSurface,
            )
            if (item.note.isNotBlank()) Text(item.note, style = MaterialTheme.typography.bodySmall, color = c.textMuted)
        }
    }
}
