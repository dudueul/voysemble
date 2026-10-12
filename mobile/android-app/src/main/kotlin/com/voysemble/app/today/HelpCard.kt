// Copyright 2026- At Day. All rights reserved.
// The traveler's "I need help" card on Today (D17, slice 074): the invitation and the button
// before any request, the request's words and "Your leaders and the organizer know" while it is
// open ("Kim answered · 07:20" once a leader did, slice 082), "Resolved" after; the sheet takes what is wrong (optional) and sends. The form is its own
// composable so the screenshot test renders it without a sheet.

package com.voysemble.app.today

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
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
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.voysemble.app.ui.LocalVoysembleColors
import com.voysemble.app.ui.VyCard
import com.voysemble.core.i18n.Txt
import com.voysemble.core.i18n.tr
import com.voysemble.core.i18n.trf
import com.voysemble.core.today.HelpCard
import com.voysemble.core.today.HelpStatus

@Composable
fun HelpCardView(help: HelpCard?, sending: Boolean, error: String?, onAsk: () -> Unit) {
    val c = LocalVoysembleColors.current
    VyCard {
        Text(tr(Txt.TODAY_HELP), style = MaterialTheme.typography.labelSmall, color = c.textMuted)
        Spacer(Modifier.height(6.dp))
        if (help == null) {
            Text(tr(Txt.TODAY_HELP_INTRO), style = MaterialTheme.typography.bodyMedium, color = c.textMuted)
        } else {
            val open = help.status == HelpStatus.OPEN
            Text(help.title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = if (open) c.warning else c.action)
            Spacer(Modifier.height(4.dp))
            Text(
                when {
                    !open -> trf(Txt.TODAY_HELP_RESOLVED, help.resolvedAt ?: help.openedAt)
                    // Slice 082: someone answered; name them and the time.
                    help.answeredBy != null -> trf(Txt.TODAY_HELP_ANSWERED, help.answeredBy, help.answeredAt ?: help.openedAt)
                    else -> trf(Txt.TODAY_HELP_SENT, help.openedAt)
                },
                style = MaterialTheme.typography.bodyMedium,
                color = c.textMuted,
            )
        }
        error?.let {
            Spacer(Modifier.height(6.dp))
            Text(it, style = MaterialTheme.typography.bodyMedium, color = c.danger)
        }
        if (help == null || help.status == HelpStatus.RESOLVED) {
            Spacer(Modifier.height(10.dp))
            Button(
                onClick = onAsk,
                enabled = !sending,
                colors = ButtonDefaults.buttonColors(containerColor = c.danger, contentColor = c.onAction),
                shape = MaterialTheme.shapes.small,
            ) { Text(tr(Txt.TODAY_HELP_ASK)) }
        }
    }
}

@Composable
fun HelpForm(onSend: (String) -> Unit) {
    val c = LocalVoysembleColors.current
    var text by remember { mutableStateOf("") }
    Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp)) {
        Text(tr(Txt.TODAY_HELP_ASK), style = MaterialTheme.typography.titleLarge)
        Text(tr(Txt.TODAY_HELP_INTRO), style = MaterialTheme.typography.bodyMedium, color = c.textMuted, modifier = Modifier.padding(top = 4.dp))
        OutlinedTextField(
            value = text,
            onValueChange = { text = it.take(160) },
            label = { Text(tr(Txt.TODAY_HELP_WHAT)) },
            modifier = Modifier.fillMaxWidth().padding(top = 12.dp).semantics { contentDescription = tr(Txt.TODAY_HELP_WHAT) },
            maxLines = 3,
        )
        Spacer(Modifier.height(12.dp))
        Button(
            onClick = { onSend(text) },
            colors = ButtonDefaults.buttonColors(containerColor = c.danger, contentColor = c.onAction),
            shape = MaterialTheme.shapes.small,
        ) { Text(tr(Txt.TODAY_HELP_SEND)) }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HelpSheet(onSend: (String) -> Unit, onDismiss: () -> Unit) {
    ModalBottomSheet(onDismissRequest = onDismiss) {
        HelpForm { text ->
            onSend(text)
            onDismiss()
        }
    }
}
