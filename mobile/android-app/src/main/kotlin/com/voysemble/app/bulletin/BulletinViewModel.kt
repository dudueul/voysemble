// Copyright 2026- At Day. All rights reserved.
// Bulletin (announcements) state holder. Owns the AnnouncementFeed from core and the local ack
// queue; confirmation arrives from sync in a later slice.

package com.voysemble.app.bulletin

import androidx.lifecycle.ViewModel
import com.voysemble.core.announcements.AnnouncementFeed
import com.voysemble.core.announcements.acknowledge
import com.voysemble.core.fixtures.KoreaConcertTourFixture
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update

class BulletinViewModel(initial: AnnouncementFeed = KoreaConcertTourFixture.announcements()) : ViewModel() {
    private val _state = MutableStateFlow(initial)
    val state: StateFlow<AnnouncementFeed> = _state

    fun acknowledge(id: String) = _state.update { it.acknowledge(id) }
}
