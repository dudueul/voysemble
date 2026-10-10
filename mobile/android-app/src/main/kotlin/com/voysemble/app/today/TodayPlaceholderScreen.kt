// Copyright 2026- At Day. All rights reserved.
// Placeholder screen for slice 002. Shows backend reachability with non-color status cues.

package com.voysemble.app.today

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle

@Composable
fun TodayPlaceholderScreen(vm: TodayPlaceholderViewModel) {
    val state by vm.state.collectAsStateWithLifecycle()
    Scaffold { padding ->
        Column(
            modifier = Modifier.fillMaxSize().padding(padding).padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Text("Voysemble", style = MaterialTheme.typography.headlineLarge)
            Text("Today (placeholder, slice 002)", style = MaterialTheme.typography.bodyLarge)
            Button(onClick = vm::checkHealth) { Text("Check backend") }
            Text(
                text = when (val s = state) {
                    HealthUiState.Idle -> "Not checked yet"
                    HealthUiState.Loading -> "Checking…"
                    is HealthUiState.Reachable -> "✓ Reachable: ${s.health.envName} build ${s.health.buildId}"
                    is HealthUiState.ServerError -> "✗ Server error ${s.code} (ref ${s.correlationId})"
                    is HealthUiState.Offline -> "⚠ Offline: ${s.reason}"
                },
                style = MaterialTheme.typography.bodyMedium,
            )
        }
    }
}
