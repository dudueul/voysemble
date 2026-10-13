// Copyright 2026- At Day. All rights reserved.
// Facts (slice 087): a saved itinerary loads back for its trip with its save time; another trip's
// pack is ignored; a pack older than 30 days is dropped; garbage reads as no pack; clear empties
// it; sign-out and a remote wipe clear it with the session; the age reads in whole minutes.

package com.voysemble.core.offline

import com.voysemble.core.api.ItineraryDayDto
import com.voysemble.core.api.ItineraryDto
import com.voysemble.core.session.InMemorySecureStore
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class OfflinePackTest {
    private val itinerary = ItineraryDto(
        tripId = "trip1", tripName = "Korea Concert Tour", startDate = "2026-12-28", endDate = "2027-01-09", revision = 3,
        publishedAt = "2026-12-20T00:00:00.000Z", view = "published",
        days = listOf(ItineraryDayDto("2026-12-31", "Europe/Rome", "Day 4")), events = emptyList(), unpublished = 0,
    )
    private val day = 24L * 60 * 60 * 1000

    @Test
    fun round_trip_for_the_same_trip_only() {
        val store = InMemorySecureStore()
        val pack = OfflinePack(store)
        pack.save("trip1", itinerary, savedAtMillis = 1_000_000L)
        assertEquals(PackedItinerary(itinerary, 1_000_000L), pack.load("trip1", nowMillis = 1_000_000L + 5 * 60_000L))
        assertNull(pack.load("trip2", nowMillis = 1_000_000L))
        // A later save replaces it; the store holds one pack.
        pack.save("trip2", itinerary.copy(tripId = "trip2"), savedAtMillis = 2_000_000L)
        assertNull(pack.load("trip1", nowMillis = 2_000_000L))
        assertEquals("trip2", pack.load("trip2", nowMillis = 2_000_000L)?.itinerary?.tripId)
    }

    @Test
    fun expiry_garbage_and_clear() {
        val store = InMemorySecureStore()
        val pack = OfflinePack(store)
        pack.save("trip1", itinerary, savedAtMillis = 0L)
        assertEquals(itinerary, pack.load("trip1", nowMillis = 30 * day)?.itinerary)
        assertNull(pack.load("trip1", nowMillis = 30 * day + 1))
        assertNull(store.get(OfflinePack.KEY))
        store.put(OfflinePack.KEY, "not json")
        assertNull(pack.load("trip1", nowMillis = 0L))
        pack.save("trip1", itinerary, savedAtMillis = 0L)
        pack.clear()
        assertNull(pack.load("trip1", nowMillis = 0L))
    }

    @Test
    fun age_in_whole_minutes() {
        assertEquals(0, packAgeMinutes(1_000L, 1_000L))
        assertEquals(128, packAgeMinutes(0L, 128 * 60_000L + 59_000L))
        assertEquals(0, packAgeMinutes(10_000L, 0L))
    }
}
