// Copyright 2026- At Day. All rights reserved.
// Bulletin state holder. With a live trip it syncs through core (outbox replay + fetch + merge)
// and acks locally first; without one it shows the fixture (sample mode).

package com.voysemble.app.bulletin

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.voysemble.core.announcements.AnnouncementFeed
import com.voysemble.core.announcements.acknowledge
import com.voysemble.core.api.ApiClient
import com.voysemble.core.fixtures.KoreaConcertTourFixture
import com.voysemble.core.session.ActiveTrip
import com.voysemble.core.sync.syncBulletin
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

data class BulletinUiState(val feed: AnnouncementFeed, val live: Boolean, val syncing: Boolean = false)

class BulletinViewModel(
    private val api: ApiClient? = null,
    private val trip: ActiveTrip? = null,
    initial: AnnouncementFeed = if (trip == null) KoreaConcertTourFixture.announcements() else AnnouncementFeed(emptyList(), emptyList(), false),
    private val now: () -> String = { Instant.now().toString() },
) : ViewModel() {
    private val _state = MutableStateFlow(BulletinUiState(initial, live = trip != null && api != null))
    val state: StateFlow<BulletinUiState> = _state

    init {
        if (_state.value.live) refresh()
    }

    /** Local first (PENDING + outbox), then one sync attempt that replays the outbox. */
    fun acknowledge(id: String) {
        _state.update { it.copy(feed = it.feed.acknowledge(id)) }
        if (_state.value.live) refresh()
    }

    fun refresh() {
        val a = api ?: return
        val t = trip ?: return
        _state.update { it.copy(syncing = true) }
        viewModelScope.launch {
            val result = syncBulletin(a, t.organizationId, t.tripId, _state.value.feed, { now() }, ::localTime)
            _state.update { it.copy(feed = result.feed, syncing = false) }
        }
    }

    private fun localTime(iso: String): String = try {
        DateTimeFormatter.ofPattern("MMM d, HH:mm").withZone(ZoneId.systemDefault()).format(Instant.parse(iso))
    } catch (_: Exception) {
        iso
    }
}
