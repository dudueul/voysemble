// Copyright 2026- At Day. All rights reserved.
//
// Travel bookings on the phone (D37, slice 047): what the organizer booked, read off per day on
// the Plan tab by a leader. Pure Kotlin over the wire types: a day's flights (departing or
// arriving that day), the hotel of that night (check-in, a night in the middle, or the check-out
// morning) and every bus with its seats from the roster. No driver contact: it never leaves the
// console. Functions rather than properties where Swift must see members.

package com.voysemble.core.travel

import com.voysemble.core.api.TravelPlanDto
import com.voysemble.core.i18n.Txt
import com.voysemble.core.i18n.tr
import com.voysemble.core.i18n.trf
import com.voysemble.core.today.epochDayOf

public data class Flight(
    val id: String,
    val code: String,
    val from: String,
    val to: String,
    /** Wall-clock at the place, YYYY-MM-DDTHH:mm. */
    val departsAt: String,
    val arrivesAt: String,
    val pax: Int,
    val pnr: String,
    /** scheduled | delayed | done | cancelled */
    val status: String,
)

public data class Hotel(
    val id: String,
    val name: String,
    val city: String,
    val checkIn: String,
    val checkOut: String,
    val rooms: Int,
    val confirmation: String,
    val nights: Int,
)

/** A bus as a leader sees it: no driver contact (D37). */
public data class BusCharter(
    val id: String,
    val label: String,
    val company: String,
    val seats: Int,
    val groups: List<String>,
    val assigned: Int,
)

public data class TripTravel(
    val flights: List<Flight>,
    val hotels: List<Hotel>,
    val buses: List<BusCharter>,
    val offline: Boolean = false,
)

/** A hotel on one day: `night` is 1 on the check-in day and `nights + 1` on the check-out morning. */
public data class HotelStay(val hotel: Hotel, val night: Int)

/** One day's bookings: flights that depart or arrive, the hotel of the night, every bus. */
public data class DayTravel(
    val date: String,
    val flights: List<Flight>,
    val hotels: List<HotelStay>,
    val buses: List<BusCharter>,
)

public fun travelOf(dto: TravelPlanDto): TripTravel = TripTravel(
    flights = dto.flights.map { Flight(it.id, it.code, it.from, it.to, it.departsAt, it.arrivesAt, it.pax, it.pnr, it.status) },
    hotels = dto.hotels.map { Hotel(it.id, it.name, it.city, it.checkIn, it.checkOut, it.rooms, it.confirmation, it.nights) },
    buses = dto.buses.map { BusCharter(it.id, it.label, it.company, it.seats, it.groups, it.assigned) },
)

public fun emptyTripTravel(): TripTravel = TripTravel(emptyList(), emptyList(), emptyList())

public fun TripTravel.withOffline(offline: Boolean): TripTravel = copy(offline = offline)

/** The flights that touch the day, the hotels whose stay covers it (check-out morning included), every bus. */
public fun TripTravel.bookingsOn(date: String): DayTravel {
    val day = epochDayOf(date)
    val stays = hotels.mapNotNull { h ->
        val night = (day - epochDayOf(h.checkIn)).toInt() + 1
        if (night in 1..(h.nights + 1)) HotelStay(h, night) else null
    }
    return DayTravel(
        date = date,
        flights = flights.filter { it.departsAt.take(10) == date || it.arrivesAt.take(10) == date },
        hotels = stays,
        buses = buses,
    )
}

/** True when no flight and no hotel touches the day; the buses still show. */
public fun DayTravel.isQuiet(): Boolean = flights.isEmpty() && hotels.isEmpty()

private fun hhmm(local: String): String = if (local.length >= 16) local.substring(11, 16) else local

public fun flightStatusLabel(status: String): String = when (status) {
    "delayed" -> tr(Txt.STATUS_DELAYED)
    "done" -> tr(Txt.STATUS_DONE)
    "cancelled" -> tr(Txt.STATUS_CANCELLED)
    else -> tr(Txt.STATUS_SCHEDULED)
}

/** "ICN → FCO". */
public fun Flight.title(): String = "$from → $to"

/** "DEMO 901 · 13:30 → 18:55 · PNR VYS8K2 · 42 seats". */
public fun Flight.detail(): String = listOfNotNull(
    code,
    "${hhmm(departsAt)} → ${hhmm(arrivesAt)}",
    pnr.takeIf { it.isNotBlank() }?.let { trf(Txt.TRAVEL_PNR, it) },
    trf(Txt.TRAVEL_SEATS, pax),
).joinToString(" · ")

/** "Check-in today · 5 nights", "Night 4 of 5" or "Check-out today", then the city and the rooms. */
public fun HotelStay.detail(): String = listOf(
    when {
        night == 1 -> trf(Txt.TRAVEL_CHECK_IN, hotel.nights)
        night > hotel.nights -> tr(Txt.TRAVEL_CHECK_OUT)
        else -> trf(Txt.TRAVEL_NIGHT_OF, night, hotel.nights)
    },
    hotel.city,
    trf(Txt.TRAVEL_ROOMS, hotel.rooms),
).joinToString(" · ")

/** "Roma Coach · 20 of 45 seats · Groups: Bus A". */
public fun BusCharter.detail(): String = listOfNotNull(
    company,
    trf(Txt.TRAVEL_BUS_SEATS, assigned, seats),
    groups.takeIf { it.isNotEmpty() }?.let { trf(Txt.TRAVEL_GROUPS, it.joinToString(", ")) },
).joinToString(" · ")
