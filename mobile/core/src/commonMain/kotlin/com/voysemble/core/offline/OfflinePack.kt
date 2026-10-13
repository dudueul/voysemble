// Copyright 2026- At Day. All rights reserved.
//
// The offline pack (slice 087, ADR-0009, D28): the last published itinerary of the active trip,
// kept in the platform's encrypted SecureStore (Android Keystore, iOS Keychain device-only) so
// Today and the Plan tab open with the plan after a restart with no signal. One trip at a time
// (the active one); a pack for another trip is ignored and replaced by the next save; it expires
// after MAX_AGE_DAYS; sign-out and a remote wipe clear it with the session (SessionManager).
// Owns no clock: callers pass the instants, so the rules are deterministic in tests.

package com.voysemble.core.offline

import com.voysemble.core.api.ItineraryDto
import com.voysemble.core.session.SecureStore
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

/** What a load answers: the itinerary and when it was saved (epoch milliseconds). */
public data class PackedItinerary(val itinerary: ItineraryDto, val savedAtMillis: Long)

@Serializable
private data class PackFile(val tripId: String, val savedAtMillis: Long, val itinerary: ItineraryDto)

public class OfflinePack(private val store: SecureStore) {
    /** Keep the itinerary the server just answered for this trip; replaces any earlier pack. */
    public fun save(tripId: String, itinerary: ItineraryDto, savedAtMillis: Long) {
        store.put(KEY, json.encodeToString(PackFile.serializer(), PackFile(tripId, savedAtMillis, itinerary)))
    }

    /** The pack for this trip when it is younger than MAX_AGE_DAYS; null otherwise or when unreadable. */
    public fun load(tripId: String, nowMillis: Long): PackedItinerary? {
        val raw = store.get(KEY) ?: return null
        val file = try { json.decodeFromString(PackFile.serializer(), raw) } catch (_: Exception) { return null }
        if (file.tripId != tripId) return null
        if (nowMillis - file.savedAtMillis > MAX_AGE_DAYS * DAY_MILLIS) {
            clear()
            return null
        }
        return PackedItinerary(file.itinerary, file.savedAtMillis)
    }

    public fun clear() {
        store.put(KEY, null)
    }

    public companion object {
        public const val KEY: String = "pack.itinerary"
        public const val MAX_AGE_DAYS: Long = 30
        private const val DAY_MILLIS: Long = 24L * 60 * 60 * 1000
        private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }
    }
}

/** Whole minutes from a save to now (never negative), for the "Synced N min ago" line. */
public fun packAgeMinutes(savedAtMillis: Long, nowMillis: Long): Int =
    ((nowMillis - savedAtMillis).coerceAtLeast(0) / 60_000L).toInt()
