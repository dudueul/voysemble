// Copyright 2026- At Day. All rights reserved.
// "Your room tonight" on Today (D41, slice 075): the hotel and the room once the organizer placed
// the traveler, who shares it; before that, the hotel and whom to ask.

package com.voysemble.app.today

import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.voysemble.app.ui.LocalVoysembleColors
import com.voysemble.app.ui.VyCard
import com.voysemble.core.i18n.Txt
import com.voysemble.core.i18n.tr
import com.voysemble.core.i18n.trf
import com.voysemble.core.today.MyRoomCard

@Composable
fun RoomCard(card: MyRoomCard) {
    val c = LocalVoysembleColors.current
    VyCard {
        Text(tr(Txt.TODAY_ROOM), style = MaterialTheme.typography.labelSmall, color = c.textMuted)
        Spacer(Modifier.height(6.dp))
        val room = card.room
        if (room == null) {
            Text(trf(Txt.TODAY_ROOM_PENDING, card.hotelName), style = MaterialTheme.typography.bodyMedium, color = c.textMuted)
        } else {
            Text(trf(Txt.TODAY_ROOM_AT, room, card.hotelName), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(4.dp))
            Text(
                if (card.roommates.isEmpty()) tr(Txt.TODAY_ROOM_ALONE) else trf(Txt.TODAY_ROOM_WITH, card.roommates.joinToString(", ")),
                style = MaterialTheme.typography.bodyMedium,
                color = c.textMuted,
            )
        }
    }
}
