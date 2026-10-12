// Copyright 2026- At Day. All rights reserved.
// A card opened by hand from the phone (slice 073, D17): what happened and the travelers of the
// leader's group as checkboxes, in a sheet under the Incidents header. The form is its own
// composable so the screenshot test renders it without a sheet.

package com.voysemble.app.incidents

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
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
import androidx.compose.ui.unit.dp
import com.voysemble.app.ui.LocalVoysembleColors
import com.voysemble.core.api.ParticipationDto
import com.voysemble.core.i18n.Txt
import com.voysemble.core.i18n.tr
import com.voysemble.core.i18n.trf

@Composable
fun NewIncidentForm(
    travelers: List<ParticipationDto>?,
    error: String?,
    onOpen: (title: String, participationIds: List<String>) -> Unit,
) {
    val c = LocalVoysembleColors.current
    var title by remember { mutableStateOf("") }
    var chosen by remember { mutableStateOf(setOf<String>()) }
    Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp)) {
        Text(tr(Txt.INC_NEW), style = MaterialTheme.typography.titleLarge)
        Text(tr(Txt.INC_NEW_HINT), style = MaterialTheme.typography.bodyMedium, color = c.textMuted, modifier = Modifier.padding(top = 4.dp))
        OutlinedTextField(
            value = title,
            onValueChange = { title = it.take(160) },
            label = { Text(tr(Txt.INC_NEW_TITLE)) },
            modifier = Modifier.fillMaxWidth().padding(top = 12.dp).semantics { contentDescription = tr(Txt.INC_NEW_TITLE) },
            maxLines = 3,
        )
        Text(tr(Txt.INC_NEW_PEOPLE), style = MaterialTheme.typography.labelLarge, modifier = Modifier.padding(top = 12.dp, bottom = 4.dp))
        when {
            travelers == null -> Text(tr(Txt.COMMON_SYNCING), style = MaterialTheme.typography.bodyMedium, color = c.textMuted)
            travelers.isEmpty() -> Text(tr(Txt.INC_NONE), style = MaterialTheme.typography.bodyMedium, color = c.textMuted)
            else -> travelers.forEach { p ->
                val on = p.id in chosen
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { chosen = if (on) chosen - p.id else chosen + p.id }
                        .semantics { contentDescription = trf(Txt.INC_NEW_PERSON_SPOKEN, p.displayName) },
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Checkbox(checked = on, onCheckedChange = null)
                    Text(p.displayName, style = MaterialTheme.typography.bodyLarge)
                    p.groupName?.let { Text(" · $it", style = MaterialTheme.typography.bodyMedium, color = c.textMuted) }
                }
            }
        }
        error?.let { Text(it, style = MaterialTheme.typography.bodyMedium, color = c.danger, modifier = Modifier.padding(top = 8.dp)) }
        Spacer(Modifier.height(12.dp))
        Button(
            onClick = { onOpen(title, chosen.toList()) },
            enabled = title.isNotBlank() && chosen.isNotEmpty(),
            colors = ButtonDefaults.buttonColors(containerColor = c.action, contentColor = c.onAction),
            shape = MaterialTheme.shapes.small,
        ) { Text(tr(Txt.INC_NEW_OPEN)) }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NewIncidentSheet(
    travelers: List<ParticipationDto>?,
    error: String?,
    onOpen: (title: String, participationIds: List<String>) -> Unit,
    onDismiss: () -> Unit,
) {
    ModalBottomSheet(onDismissRequest = onDismiss) {
        NewIncidentForm(travelers, error) { title, ids ->
            onOpen(title, ids)
            onDismiss()
        }
    }
}
