// Copyright 2026- At Day. All rights reserved.
//
// Mobile sign-in (atlas #2): email -> "check your email" -> paste the link. Android App Links
// for https://…/auth/verify arrive in a later slice; until then the pasted link or token is the
// path, and it is the same token the web console verifies. "Browse the sample" is the honest
// fixture entry point.

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
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
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
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.voysemble.app.session.SessionUiState
import com.voysemble.app.ui.LocalVoysembleColors
import com.voysemble.app.ui.VyCard
import com.voysemble.core.session.SessionState

@Composable
fun SignInScreen(
    state: SessionUiState,
    onRequestLink: (String) -> Unit,
    onVerify: (String) -> Unit,
    onBrowseSample: () -> Unit,
    onStartOver: () -> Unit,
) {
    val c = LocalVoysembleColors.current
    val awaiting = state.session as? SessionState.AwaitingLink
    var email by remember { mutableStateOf("") }
    var pasted by remember { mutableStateOf("") }
    Surface(color = MaterialTheme.colorScheme.background, modifier = Modifier.fillMaxSize()) {
        Column(Modifier.fillMaxSize().padding(24.dp), verticalArrangement = Arrangement.Center) {
            Text("Voysemble", style = MaterialTheme.typography.headlineLarge)
            Text(tr(Txt.AUTH_TAGLINE), style = MaterialTheme.typography.bodyMedium, color = c.textMuted)
            if (state.revokedNotice) {
                // D28: the organizer revoked this phone; local data is already gone.
                Text(
                    tr(Txt.AUTH_REVOKED),
                    style = MaterialTheme.typography.bodyMedium,
                    color = c.danger,
                    modifier = Modifier.semantics { contentDescription = tr(Txt.AUTH_REVOKED_A11Y) },
                )
            }
            Spacer(Modifier.height(24.dp))
            VyCard {
                if (awaiting == null) {
                    Text(tr(Txt.AUTH_SIGN_IN), style = MaterialTheme.typography.titleMedium)
                    Text(tr(Txt.AUTH_NO_PASSWORD), style = MaterialTheme.typography.bodyMedium, color = c.textMuted)
                    Spacer(Modifier.height(12.dp))
                    OutlinedTextField(
                        value = email,
                        onValueChange = { email = it },
                        label = { Text(tr(Txt.AUTH_EMAIL)) },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
                        modifier = Modifier.fillMaxWidth().semantics { contentDescription = tr(Txt.AUTH_EMAIL) },
                    )
                    Spacer(Modifier.height(12.dp))
                    Button(
                        onClick = { onRequestLink(email) },
                        enabled = !state.busy && email.contains("@"),
                        colors = ButtonDefaults.buttonColors(containerColor = c.action, contentColor = c.onAction),
                        shape = MaterialTheme.shapes.small,
                        modifier = Modifier.fillMaxWidth(),
                    ) { Text(if (state.busy) tr(Txt.AUTH_SENDING) else tr(Txt.AUTH_EMAIL_ME)) }
                } else {
                    Text(tr(Txt.AUTH_CHECK_EMAIL), style = MaterialTheme.typography.titleMedium)
                    Text(
                        trf(Txt.AUTH_SENT_BODY, awaiting.email),
                        style = MaterialTheme.typography.bodyMedium,
                        color = c.textMuted,
                    )
                    Spacer(Modifier.height(12.dp))
                    OutlinedTextField(
                        value = pasted,
                        onValueChange = { pasted = it },
                        label = { Text(tr(Txt.AUTH_LINK_FIELD)) },
                        minLines = 2,
                        modifier = Modifier.fillMaxWidth().semantics { contentDescription = tr(Txt.AUTH_LINK_FIELD) },
                    )
                    Spacer(Modifier.height(12.dp))
                    Button(
                        onClick = { onVerify(pasted) },
                        enabled = !state.busy && pasted.isNotBlank(),
                        colors = ButtonDefaults.buttonColors(containerColor = c.action, contentColor = c.onAction),
                        shape = MaterialTheme.shapes.small,
                        modifier = Modifier.fillMaxWidth(),
                    ) { Text(if (state.busy) tr(Txt.AUTH_SIGNING_IN) else tr(Txt.AUTH_SIGN_IN)) }
                    TextButton(onClick = onStartOver) { Text(tr(Txt.AUTH_USE_ANOTHER)) }
                }
                state.error?.let {
                    Spacer(Modifier.height(8.dp))
                    Text(it, color = c.danger, style = MaterialTheme.typography.bodyMedium)
                }
            }
            Spacer(Modifier.height(16.dp))
            OutlinedButton(onClick = onBrowseSample, shape = MaterialTheme.shapes.small, modifier = Modifier.fillMaxWidth()) {
                Text(tr(Txt.AUTH_BROWSE_SAMPLE))
            }
        }
    }
}
