// Copyright 2026- At Day. All rights reserved.
// Shared Compose widgets for the leader and traveler screens added in slice 009: card, screen
// header with back, label chip, sample chip, pending-sync chip. Status is never color-only: every
// chip carries text.

package com.voysemble.app.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp

@Composable
fun VyCard(modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) {
    val c = LocalVoysembleColors.current
    Surface(
        shape = MaterialTheme.shapes.medium,
        color = MaterialTheme.colorScheme.surface,
        border = BorderStroke(1.dp, c.border),
        modifier = modifier.fillMaxWidth(),
    ) { Column(Modifier.padding(16.dp), content = content) }
}

/** Title row with an optional back button and a trailing slot (chips, counts). */
@Composable
fun ScreenHeader(
    eyebrow: String,
    title: String,
    subtitle: String?,
    onBack: (() -> Unit)?,
    trailing: @Composable () -> Unit = {},
) {
    val c = LocalVoysembleColors.current
    Column {
        Row(verticalAlignment = Alignment.CenterVertically) {
            if (onBack != null) {
                IconButton(onClick = onBack, modifier = Modifier.size(36.dp)) {
                    Icon(AppIcons.Back, contentDescription = "Back")
                }
                Spacer(Modifier.width(4.dp))
            }
            Column(Modifier.weight(1f)) {
                Text(eyebrow.uppercase(), style = MaterialTheme.typography.labelSmall, color = c.textMuted)
                Text(title, style = MaterialTheme.typography.headlineLarge)
            }
            trailing()
        }
        if (subtitle != null) {
            Text(subtitle, style = MaterialTheme.typography.bodyMedium, color = c.textMuted)
        }
    }
}

@Composable
fun LabelChip(text: String, color: Color, icon: ImageVector? = null) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(4.dp),
        modifier = Modifier
            .background(color.copy(alpha = 0.12f), RoundedCornerShape(999.dp))
            .padding(horizontal = 9.dp, vertical = 3.dp),
    ) {
        if (icon != null) Icon(icon, contentDescription = null, tint = color, modifier = Modifier.size(12.dp))
        Text(text, style = MaterialTheme.typography.labelSmall, color = color)
    }
}

@Composable
fun SampleDataChip() {
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

/** D14: "Pending sync" is explicit until the server acknowledges. */
@Composable
fun SyncChip(pending: Boolean) {
    val c = LocalVoysembleColors.current
    if (pending) LabelChip("Pending sync", c.warning, AppIcons.Clock) else LabelChip("Synced", c.success, AppIcons.Check)
}

@Composable
fun SectionLabel(text: String) {
    val c = LocalVoysembleColors.current
    Text(text.uppercase(), style = MaterialTheme.typography.labelSmall, color = c.textMuted)
}
