// Copyright 2026- At Day. All rights reserved.
// The trip switch on the phone (slice 067, D42): the account's trips in a sheet from the Today
// header; picking one rebinds the session and every screen follows (the view models are keyed by
// the trip id). The list is its own composable so the screenshot test renders it without a sheet.

package com.voysemble.app.today

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.voysemble.app.ui.AppIcons
import com.voysemble.app.ui.LabelChip
import com.voysemble.app.ui.LocalVoysembleColors
import com.voysemble.core.i18n.Txt
import com.voysemble.core.i18n.tr
import com.voysemble.core.session.TripChoice
import com.voysemble.core.session.dateLine
import com.voysemble.core.session.roleLine
import com.voysemble.core.session.switchSpoken

/** What the Today header needs to offer the switch; `enabled` only when signed in on a trip. */
data class TripSwitch(
    val enabled: Boolean = false,
    val choices: List<TripChoice>? = null,
    val error: String? = null,
    val onLoad: () -> Unit = {},
    val onSwitch: (TripChoice) -> Unit = {},
)

@Composable
fun TripChoiceList(choices: List<TripChoice>?, error: String?, currentTripId: String, onSwitch: (TripChoice) -> Unit) {
    val c = LocalVoysembleColors.current
    Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp)) {
        Text(tr(Txt.TRIP_SWITCH_TITLE), style = MaterialTheme.typography.titleLarge)
        when {
            error != null -> Text(error, style = MaterialTheme.typography.bodyMedium, color = c.danger, modifier = Modifier.padding(top = 8.dp))
            choices == null -> Text(tr(Txt.COMMON_SYNCING), style = MaterialTheme.typography.bodyMedium, color = c.textMuted, modifier = Modifier.padding(top = 8.dp))
            choices.size <= 1 -> Text(tr(Txt.TRIP_ONLY_ONE), style = MaterialTheme.typography.bodyMedium, color = c.textMuted, modifier = Modifier.padding(top = 8.dp))
        }
        choices?.forEach { choice ->
            val current = choice.trip.tripId == currentTripId
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 10.dp)
                    .then(if (current) Modifier else Modifier.clickable { onSwitch(choice) })
                    .semantics { contentDescription = if (current) "${choice.trip.tripName} · ${tr(Txt.TRIP_CURRENT)}" else choice.switchSpoken() },
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(Modifier.weight(1f)) {
                    Text(choice.trip.tripName, style = MaterialTheme.typography.titleMedium)
                    Text("${choice.trip.organizationName} · ${choice.roleLine()}", style = MaterialTheme.typography.bodyMedium, color = c.textMuted)
                    if (choice.dateLine().isNotEmpty()) Text(choice.dateLine(), style = MaterialTheme.typography.bodySmall, color = c.textMuted)
                }
                if (current) {
                    Spacer(Modifier.width(8.dp))
                    LabelChip(tr(Txt.TRIP_CURRENT), c.success, AppIcons.Check)
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TripSwitchSheet(tripSwitch: TripSwitch, currentTripId: String, onDismiss: () -> Unit) {
    ModalBottomSheet(onDismissRequest = onDismiss) {
        TripChoiceList(tripSwitch.choices, tripSwitch.error, currentTripId) { choice ->
            onDismiss()
            tripSwitch.onSwitch(choice)
        }
    }
}
