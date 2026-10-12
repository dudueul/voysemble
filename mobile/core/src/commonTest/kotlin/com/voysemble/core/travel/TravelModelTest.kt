// Copyright 2026- At Day. All rights reserved.
// Facts (D37, slice 047): the wire plan becomes the phone's bookings without a driver contact;
// a day holds the flights that touch it, the hotel of the night (check-in, a middle night, the
// check-out morning) and every bus; the labels in both languages; a quiet day says so.

package com.voysemble.core.travel

import com.voysemble.core.api.BusDto
import com.voysemble.core.api.FlightDto
import com.voysemble.core.api.HotelDto
import com.voysemble.core.api.TravelPlanDto
import com.voysemble.core.fixtures.KoreaConcertTourFixture
import com.voysemble.core.i18n.AppLocale
import kotlin.test.AfterTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class TravelModelTest {
    @AfterTest
    fun reset() {
        AppLocale.current = "en"
    }

    @Test
    fun wire_to_bookings_drops_nothing_a_leader_may_read() {
        val dto = TravelPlanDto(
            flights = listOf(FlightDto(id = "f", tripId = "t", code = "DEMO 901", from = "ICN", to = "FCO", departsAt = "2026-12-28T13:30", arrivesAt = "2026-12-28T18:55", pax = 42, pnr = "VYS8K2", status = "delayed", createdAt = "2026-10-12T00:00:00.000Z")),
            hotels = listOf(HotelDto(id = "h", tripId = "t", name = "Hotel de la Ville", city = "Rome", checkIn = "2026-12-28", checkOut = "2027-01-02", rooms = 21, confirmation = "X", nights = 5, createdAt = "2026-10-12T00:00:00.000Z")),
            buses = listOf(BusDto(id = "b", tripId = "t", label = "Bus A", company = "Roma Coach", seats = 24, driverContact = null, groups = listOf("Bus A"), assigned = 2, createdAt = "2026-10-12T00:00:00.000Z")),
            groups = listOf("Bus A", "Bus B"),
            travelers = 3,
        )
        val travel = travelOf(dto)
        assertEquals("ICN → FCO", travel.flights.single().title())
        assertEquals("DEMO 901 · 13:30 → 18:55 · PNR VYS8K2 · 42 seats", travel.flights.single().detail())
        assertEquals("Delayed", flightStatusLabel(travel.flights.single().status))
        assertEquals("Roma Coach · 2 of 24 seats · Groups: Bus A", travel.buses.single().detail())
        assertFalse(travel.offline)
        assertTrue(travel.withOffline(true).offline)
    }

    @Test
    fun a_day_holds_its_flights_the_night_and_every_bus() {
        val travel = KoreaConcertTourFixture.travel()
        val arrival = travel.bookingsOn("2026-12-28")
        assertEquals(listOf("DEMO 901"), arrival.flights.map { it.code })
        assertEquals("Check-in today · 5 nights · Rome · 21 rooms", arrival.hotels.single().detail())
        assertEquals(2, arrival.buses.size)
        assertFalse(arrival.isQuiet())

        val concert = travel.bookingsOn(KoreaConcertTourFixture.TODAY_DATE)
        assertTrue(concert.flights.isEmpty())
        assertEquals("Night 4 of 5 · Rome · 21 rooms", concert.hotels.single().detail())
        assertFalse(concert.isQuiet())

        // The move to Florence: the Rome check-out morning and the Florence check-in.
        val move = travel.bookingsOn("2027-01-02")
        assertEquals(listOf("Check-out today · Rome · 21 rooms", "Check-in today · 4 nights · Florence · 21 rooms"), move.hotels.map { it.detail() })

        // The flight home arrives the next day: both days list it.
        assertEquals(listOf("DEMO 902"), travel.bookingsOn("2027-01-06").flights.map { it.code })
        assertEquals(listOf("DEMO 902"), travel.bookingsOn("2027-01-07").flights.map { it.code })
        assertTrue(travel.bookingsOn("2027-01-07").hotels.isEmpty())
        assertTrue(travel.bookingsOn("2027-01-08").isQuiet())
        assertTrue(emptyTripTravel().bookingsOn("2026-12-28").isQuiet())
    }

    @Test
    fun labels_in_korean() {
        AppLocale.current = "ko"
        val travel = KoreaConcertTourFixture.travel()
        assertEquals("5박 중 4일째 밤 · Rome · 객실 21개", travel.bookingsOn("2026-12-31").hotels.single().detail())
        assertEquals("DEMO 901 · 13:30 → 18:55 · PNR VYS8K2 · 42석", travel.flights.first().detail())
        assertEquals("Roma Coach · 45석 중 20석 · 그룹: Bus A", travel.buses.first().detail())
        assertEquals("완료", flightStatusLabel("done"))
    }
}
