// Copyright 2026- At Day. All rights reserved.
//
// Mobile sign-in (atlas #2): email -> "check your email" -> paste the link. Android App Links
// for https://…/auth/verify arrive in a later slice; until then the pasted link or token is the
// path, and it is the same token the web console verifies. "Browse the sample" is the honest
// fixture entry point.

package com.voysemble.app.auth

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
            Text("Journeys are better together", style = MaterialTheme.typography.bodyMedium, color = c.textMuted)
            Spacer(Modifier.height(24.dp))
            VyCard {
                if (awaiting == null) {
                    Text("Sign in", style = MaterialTheme.typography.titleMedium)
                    Text("We email you a one-time link. No password.", style = MaterialTheme.typography.bodyMedium, color = c.textMuted)
                    Spacer(Modifier.height(12.dp))
                    OutlinedTextField(
                        value = email,
                        onValueChange = { email = it },
                        label = { Text("Email") },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
                        modifier = Modifier.fillMaxWidth().semantics { contentDescription = "Email" },
                    )
                    Spacer(Modifier.height(12.dp))
                    Button(
                        onClick = { onRequestLink(email) },
                        enabled = !state.busy && email.contains("@"),
                        colors = ButtonDefaults.buttonColors(containerColor = c.action, contentColor = c.onAction),
                        shape = MaterialTheme.shapes.small,
                        modifier = Modifier.fillMaxWidth(),
                    ) { Text(if (state.busy) "Sending…" else "Email me a link") }
                } else {
                    Text("Check your email", style = MaterialTheme.typography.titleMedium)
                    Text(
                        "If ${awaiting.email} can sign in, a link is on its way. It works once, for 15 minutes. Paste it here.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = c.textMuted,
                    )
                    Spacer(Modifier.height(12.dp))
                    OutlinedTextField(
                        value = pasted,
                        onValueChange = { pasted = it },
                        label = { Text("Link from the email") },
                        minLines = 2,
                        modifier = Modifier.fillMaxWidth().semantics { contentDescription = "Link from the email" },
                    )
                    Spacer(Modifier.height(12.dp))
                    Button(
                        onClick = { onVerify(pasted) },
                        enabled = !state.busy && pasted.isNotBlank(),
                        colors = ButtonDefaults.buttonColors(containerColor = c.action, contentColor = c.onAction),
                        shape = MaterialTheme.shapes.small,
                        modifier = Modifier.fillMaxWidth(),
                    ) { Text(if (state.busy) "Signing in…" else "Sign in") }
                    TextButton(onClick = onStartOver) { Text("Use another address") }
                }
                state.error?.let {
                    Spacer(Modifier.height(8.dp))
                    Text(it, color = c.danger, style = MaterialTheme.typography.bodyMedium)
                }
            }
            Spacer(Modifier.height(16.dp))
            OutlinedButton(onClick = onBrowseSample, shape = MaterialTheme.shapes.small, modifier = Modifier.fillMaxWidth()) {
                Text("Browse the sample trip")
            }
        }
    }
}
