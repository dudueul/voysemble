// Copyright 2026- At Day. All rights reserved.
//
// "Your room tonight" on Today (D41, slice 075), shared by Android and iOS: the hotel, the room
// once the organizer placed the traveler, and who shares it. Pure mapping over the wire shape;
// the apps carry the words ("Room 412 · Hotel de la Ville", "with Juho Kim").

package com.voysemble.core.today

import com.voysemble.core.api.MyRoomDto

public data class MyRoomCard(
    val hotelName: String,
    /** Null until the organizer placed the traveler: the card says so and names the leader as the one to ask. */
    val room: String?,
    /** The others in the same room, by name; empty for a room to oneself. */
    val roommates: List<String>,
    /** The stay's last morning (YYYY-MM-DD). */
    val checkOut: String,
)

/** The card, or null outside any stay (the card is then not shown). */
public fun myRoomCardOf(dto: MyRoomDto): MyRoomCard? =
    dto.stay?.let { MyRoomCard(it.hotelName, it.room, it.roommates, it.checkOut) }
