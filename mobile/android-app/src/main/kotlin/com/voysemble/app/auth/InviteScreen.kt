// Copyright 2026- At Day. All rights reserved.
// Join a trip (atlas #3): the code from the organizer's printout or message. Role comes from the
// code (D12); the screen never offers a role picker.

package com.voysemble.app.auth

import com.voysemble.core.i18n.Txt
import com.voysemble.core.i18n.tr
import com.voysemble.core.i18n.trf
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.voysemble.app.session.SessionUiState
import com.voysemble.app.ui.LocalVoysembleColors
import com.voysemble.app.ui.VyCard
import com.voysemble.core.session.SessionState

@Composable
fun InviteScreen(state: SessionUiState, onRedeem: (String) -> Unit, onSignOut: () -> Unit) {
    val c = LocalVoysembleColors.current
    val email = (state.session as? SessionState.NeedsInvite)?.email ?: ""
    var code by remember { mutableStateOf("") }
    Surface(color = MaterialTheme.colorScheme.background, modifier = Modifier.fillMaxSize()) {
        Column(Modifier.fillMaxSize().padding(24.dp), verticalArrangement = Arrangement.Center) {
            Text(tr(Txt.INVITE_TITLE), style = MaterialTheme.typography.headlineLarge)
            Text(trf(Txt.INVITE_SIGNED_IN_AS, email), style = MaterialTheme.typography.bodyMedium, color = c.textMuted)
            Spacer(Modifier.height(24.dp))
            VyCard {
                Text(tr(Txt.INVITE_JOIN), style = MaterialTheme.typography.titleMedium)
                Text(tr(Txt.INVITE_HINT), style = MaterialTheme.typography.bodyMedium, color = c.textMuted)
                Spacer(Modifier.height(12.dp))
                OutlinedTextField(
                    value = code,
                    onValueChange = { code = it.uppercase() },
                    label = { Text(tr(Txt.INVITE_CODE)) },
                    placeholder = { Text("K7PX-4MDQ") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth().semantics { contentDescription = tr(Txt.INVITE_CODE) },
                )
                Spacer(Modifier.height(12.dp))
                Button(
                    onClick = { onRedeem(code) },
                    enabled = !state.busy && code.replace("-", "").length >= 8,
                    colors = ButtonDefaults.buttonColors(containerColor = c.action, contentColor = c.onAction),
                    shape = MaterialTheme.shapes.small,
                    modifier = Modifier.fillMaxWidth(),
                ) { Text(if (state.busy) tr(Txt.INVITE_JOINING) else tr(Txt.INVITE_JOIN_TRIP)) }
                state.error?.let {
                    Spacer(Modifier.height(8.dp))
                    Text(it, color = c.danger, style = MaterialTheme.typography.bodyMedium)
                }
            }
            Spacer(Modifier.height(8.dp))
            TextButton(onClick = onSignOut) { Text(tr(Txt.COMMON_SIGN_OUT)) }
        }
    }
}
