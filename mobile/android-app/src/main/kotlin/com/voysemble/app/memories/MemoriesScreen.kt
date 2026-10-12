// Copyright 2026- At Day. All rights reserved.
//
// Memories tab (D18, slice 044): the trip pool as a three-column grid of thumbnails with the
// uploader and the day, the review queue for leaders (flag, approve, remove), "Add photos"
// through the system photo picker (no permission prompt), the album chip, and a guardian's
// album-only view. Thumbnails come from the API through the client (bearer token), so the grid
// never holds a URL the browser could follow; the fixture draws tinted placeholders.

package com.voysemble.app.memories

import android.content.Context
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.voysemble.app.ui.AppIcons
import com.voysemble.app.ui.LabelChip
import com.voysemble.app.ui.LocalVoysembleColors
import com.voysemble.app.ui.SampleDataChip
import com.voysemble.app.ui.ScreenHeader
import com.voysemble.app.ui.SectionLabel
import com.voysemble.app.ui.VyCard
import com.voysemble.core.i18n.Txt
import com.voysemble.core.i18n.tr
import com.voysemble.core.i18n.trf
import com.voysemble.core.memories.Memory
import com.voysemble.core.memories.album()
import com.voysemble.core.memories.albumLabel
import com.voysemble.core.memories.canDelete
import com.voysemble.core.memories.canReviewPhotos
import com.voysemble.core.memories.canUploadPhotos
import com.voysemble.core.memories.caption
import com.voysemble.core.memories.flagLabel
import com.voysemble.core.memories.pool()
import com.voysemble.core.memories.queue()
import com.voysemble.core.memories.summary
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

@Composable
fun MemoriesRoute(vm: MemoriesViewModel) {
    val state by vm.state.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.PickMultipleVisualMedia(5)) { uris ->
        if (uris.isNotEmpty()) vm.uploadFrom(context, uris)
    }
    MemoriesScreen(
        state,
        onAdd = { picker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) },
        onApprove = { vm.review(it, "clear") },
        onRemove = { vm.review(it, "remove") },
        onAlbum = { vm.album(it) },
        onDelete = { vm.delete(it) },
    )
}

/** Reads the picked images off the main thread, then hands the bytes to the view model. */
fun MemoriesViewModel.uploadFrom(context: Context, uris: List<Uri>) {
    val vm = this
    vm.viewModelScope.launch(Dispatchers.IO) {
        val images = uris.mapNotNull { uri ->
            runCatching {
                context.contentResolver.openInputStream(uri)?.use { it.readBytes() }?.let { PickedImage(it, takenAt = null) }
            }.getOrNull()
        }
        withContext(Dispatchers.Main) { vm.upload(images) }
    }
}

@Composable
fun MemoriesScreen(
    state: MemoriesUiState,
    onAdd: () -> Unit = {},
    onApprove: (String) -> Unit = {},
    onRemove: (String) -> Unit = {},
    onAlbum: (String) -> Unit = {},
    onDelete: (String) -> Unit = {},
) {
    val c = LocalVoysembleColors.current
    val feed = state.feed
    val role = state.role
    val guardian = role == "guardian"
    val reviewer = canReviewPhotos(role)
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            ScreenHeader(
                eyebrow = tr(Txt.MEM_EYEBROW),
                title = tr(Txt.MEM_TITLE),
                subtitle = feed.summary(role),
                onBack = null,
            ) { if (!state.live) SampleDataChip() else LabelChip(if (state.syncing) tr(Txt.COMMON_SYNCING) else tr(Txt.COMMON_LIVE), c.info, AppIcons.Check) }
        }
        state.error?.let { item { Text(it, style = MaterialTheme.typography.bodyMedium, color = c.danger) } }
        state.notice?.let { item { Text(it, style = MaterialTheme.typography.bodyMedium, color = c.textMuted) } }
        if (canUploadPhotos(role)) {
            item {
                Button(
                    onClick = onAdd,
                    enabled = feed.uploading == 0,
                    colors = ButtonDefaults.buttonColors(containerColor = c.action, contentColor = Color.White),
                ) {
                    Icon(AppIcons.Memories, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.size(8.dp))
                    Text(tr(Txt.MEM_ADD), fontWeight = FontWeight.SemiBold)
                }
            }
        }
        if (reviewer && feed.queue().isNotEmpty()) {
            item { SectionLabel(tr(Txt.MEM_QUEUE)) }
            item { Text(tr(Txt.MEM_QUEUE_HINT), style = MaterialTheme.typography.bodySmall, color = c.textMuted) }
            items(feed.queue(), key = { "q-${it.id}" }) { m -> QueueRow(m, state.thumbnails[m.id], onApprove, onRemove) }
        }
        if (guardian) {
            item { SectionLabel(tr(Txt.MEM_ALBUM)) }
            item { Text(tr(Txt.MEM_ALBUM_HINT), style = MaterialTheme.typography.bodySmall, color = c.textMuted) }
            if (feed.album().isEmpty()) item { Text(tr(Txt.MEM_NONE_GUARDIAN), style = MaterialTheme.typography.bodyMedium, color = c.textMuted) }
            items(feed.album().chunked(3), key = { row -> row.joinToString(",") { it.id } }) { row -> PhotoRow(row, state, role, onAlbum, onDelete) }
        } else {
            item { SectionLabel(tr(Txt.MEM_POOL)) }
            if (feed.pool().isEmpty() && !state.syncing) item { Text(tr(Txt.MEM_NONE), style = MaterialTheme.typography.bodyMedium, color = c.textMuted) }
            items(feed.pool().chunked(3), key = { row -> row.joinToString(",") { it.id } }) { row -> PhotoRow(row, state, role, onAlbum, onDelete) }
        }
    }
}

@Composable
private fun PhotoRow(row: List<Memory>, state: MemoriesUiState, role: String?, onAlbum: (String) -> Unit, onDelete: (String) -> Unit) {
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        for (m in row) {
            Box(Modifier.weight(1f)) { PhotoCell(m, state.thumbnails[m.id], role, onAlbum, onDelete) }
        }
        repeat(3 - row.size) { Spacer(Modifier.weight(1f)) }
    }
}

@Composable
private fun PhotoCell(m: Memory, bitmap: ImageBitmap?, role: String?, onAlbum: (String) -> Unit, onDelete: (String) -> Unit) {
    val c = LocalVoysembleColors.current
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Thumb(m, bitmap, Modifier.fillMaxWidth().aspectRatio(1f))
        Text(m.caption(), style = MaterialTheme.typography.labelSmall, color = c.textMuted, maxLines = 2)
        if (m.status == "approved") {
            LabelChip(tr(Txt.MEM_IN_ALBUM), c.success)
            if (m.wholeGroup || m.taggedNames.isNotEmpty()) Text(m.albumLabel(), style = MaterialTheme.typography.labelSmall, color = c.textMuted, maxLines = 1)
        }
        if (canReviewPhotos(role) && m.status == "pool") {
            TextButton(
                onClick = { onAlbum(m.id) },
                contentPadding = PaddingValues(horizontal = 4.dp, vertical = 0.dp),
                modifier = Modifier.semantics { contentDescription = trf(Txt.MEM_TAG_GROUP_SPOKEN, m.uploaderName) },
            ) { Text(tr(Txt.MEM_ADD_TO_ALBUM), style = MaterialTheme.typography.labelSmall) }
        }
        if (m.canDelete(role)) {
            TextButton(onClick = { onDelete(m.id) }, contentPadding = PaddingValues(horizontal = 4.dp, vertical = 0.dp)) {
                Text(if (m.mine) tr(Txt.MEM_DELETE_MINE) else tr(Txt.MEM_DELETE), style = MaterialTheme.typography.labelSmall, color = c.danger)
            }
        }
    }
}

/** The decoded thumbnail, or a tinted placeholder while it loads and in sample mode. */
@Composable
private fun Thumb(m: Memory, bitmap: ImageBitmap?, modifier: Modifier) {
    val spoken = trf(Txt.MEM_OPEN_SPOKEN, m.uploaderName, if (m.day > 0) trf(Txt.MEM_DAY, m.day) else tr(Txt.MEM_DAY_OUTSIDE))
    val shape = RoundedCornerShape(10.dp)
    if (bitmap != null) {
        Image(bitmap, contentDescription = spoken, contentScale = ContentScale.Crop, modifier = modifier.clip(shape))
    } else {
        val hue = (m.id.hashCode().toUInt() % 360u).toFloat()
        Box(
            modifier
                .clip(shape)
                .background(Brush.linearGradient(listOf(Color.hsl(hue, 0.55f, 0.82f), Color.hsl((hue + 40f) % 360f, 0.55f, 0.62f))))
                .semantics { contentDescription = spoken },
        )
    }
}

@Composable
private fun QueueRow(m: Memory, bitmap: ImageBitmap?, onApprove: (String) -> Unit, onRemove: (String) -> Unit) {
    val c = LocalVoysembleColors.current
    VyCard {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Thumb(m, bitmap, Modifier.size(64.dp))
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(flagLabel(m.flag), style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold)
                Text(m.caption(), style = MaterialTheme.typography.bodySmall, color = c.textMuted)
            }
        }
        Spacer(Modifier.height(8.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(
                onClick = { onApprove(m.id) },
                colors = ButtonDefaults.buttonColors(containerColor = c.action, contentColor = Color.White),
            ) { Text(tr(Txt.MEM_APPROVE)) }
            OutlinedButton(onClick = { onRemove(m.id) }) { Text(tr(Txt.MEM_REMOVE)) }
        }
    }
}
