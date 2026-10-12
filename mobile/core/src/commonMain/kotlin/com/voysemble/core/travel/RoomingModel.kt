// Copyright 2026- At Day. All rights reserved.
//
// A hotel's rooming list on the leader's phone (D41, slice 059), shared by Android and iOS.
// Pure Kotlin over the wire list: who sleeps where, grouped by room in label order, the people
// without a room, and the summary line. Read-only: the organizer places people on the console;
// travelers and guardians never see rooms (D13). Functions rather than properties where Swift
// must see members.

package com.voysemble.core.travel

import com.voysemble.core.api.RoomingListDto
import com.voysemble.core.i18n.Txt
import com.voysemble.core.i18n.tr
import com.voysemble.core.i18n.trf

public data class RoomPerson(
    val participationId: String,
    val name: String,
    val leader: Boolean,
    val group: String?,
    /** The room label, or null while unassigned. */
    val room: String?,
)

/** One room with the names in it, leaders first. */
public data class RoomGroup(val room: String, val names: List<String>)

public data class Rooming(
    val hotelName: String,
    val hotelRooms: Int,
    /** Leaders first, then travelers by group and name, as the server sends them. */
    val people: List<RoomPerson>,
    val offline: Boolean = false,
)

public fun roomingOf(dto: RoomingListDto): Rooming = Rooming(
    hotelName = dto.hotel.name,
    hotelRooms = dto.hotel.rooms,
    people = dto.people.map { RoomPerson(it.participationId, it.displayName, it.role == "leader", it.groupName, it.room) },
)

public fun emptyRooming(hotelName: String): Rooming = Rooming(hotelName, 0, emptyList())

public fun Rooming.withOffline(offline: Boolean): Rooming = copy(offline = offline)

/** The rooms in label order (numbers compare as numbers: 204 before 1001), each with its names. */
public fun Rooming.byRoom(): List<RoomGroup> = people
    .filter { it.room != null }
    .groupBy { it.room ?: "" }
    .map { (room, inRoom) -> RoomGroup(room, inRoom.map { it.name }) }
    .sortedWith(compareBy({ it.room.toIntOrNull() ?: Int.MAX_VALUE }, { it.room }))

public fun Rooming.unassigned(): List<String> = people.filter { it.room == null }.map { it.name }

public fun Rooming.assignedCount(): Int = people.count { it.room != null }

public fun Rooming.roomsUsed(): Int = people.mapNotNull { it.room }.toSet().size

/** "2 of 3 placed · 1 of 21 rooms used". */
public fun Rooming.summary(): String = trf(Txt.ROOMING_SUMMARY, assignedCount(), people.size, roomsUsed(), hotelRooms)

/** "Room 204" */
public fun roomLabel(room: String): String = trf(Txt.ROOMING_ROOM, room)

/** The row's spoken form: "Minji Park, room 204" or "Lee Hana, no room yet". */
public fun RoomPerson.spoken(): String =
    if (room != null) trf(Txt.ROOMING_PERSON_SPOKEN, name, room) else trf(Txt.ROOMING_PERSON_UNASSIGNED_SPOKEN, name)

public fun Rooming.isEmpty(): Boolean = people.isEmpty()

/** The hint under the title: read-only on the phone. */
public fun roomingHint(): String = tr(Txt.ROOMING_HINT)
