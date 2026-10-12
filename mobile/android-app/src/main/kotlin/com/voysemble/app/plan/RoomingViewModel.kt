// Copyright 2026- At Day. All rights reserved.
// Rooming list state holder (D41, slice 059). Live with a client, a trip and a hotel booking: the
// list from the API, read-only; a failure is said, an unreachable server marks it offline and
// keeps the last answer. Without a trip: the fixture list. Rules in core
// (travel/RoomingModel.kt). Leaders only reach it: the Plan tab's hotel row opens it.

package com.voysemble.app.plan

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.voysemble.core.api.ApiClient
import com.voysemble.core.api.ApiResult
import com.voysemble.core.fixtures.KoreaConcertTourFixture
import com.voysemble.core.i18n.Txt
import com.voysemble.core.i18n.tr
import com.voysemble.core.i18n.trf
import com.voysemble.core.session.ActiveTrip
import com.voysemble.core.travel.Rooming
import com.voysemble.core.travel.emptyRooming
import com.voysemble.core.travel.roomingOf
import com.voysemble.core.travel.withOffline
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class RoomingUiState(
    val rooming: Rooming,
    val live: Boolean = false,
    val syncing: Boolean = false,
    val error: String? = null,
)

class RoomingViewModel(
    initial: Rooming = KoreaConcertTourFixture.rooming(),
    private val api: ApiClient? = null,
    private val trip: ActiveTrip? = null,
    private val bookingId: String? = null,
    hotelName: String = initial.hotelName,
) : ViewModel() {
    private val live = api != null && trip != null && bookingId != null
    private val _state = MutableStateFlow(RoomingUiState(rooming = if (live) emptyRooming(hotelName) else initial, live = live))
    val state: StateFlow<RoomingUiState> = _state

    /** The first list (live); completed at once in sample mode. Tests await it. */
    val ready: Job = if (live) refresh() else Job().also { it.complete() }

    fun refresh(): Job {
        val a = api ?: return Job().also { it.complete() }
        val t = trip ?: return Job().also { it.complete() }
        val b = bookingId ?: return Job().also { it.complete() }
        _state.update { it.copy(syncing = true) }
        return viewModelScope.launch {
            when (val r = a.rooming(t.organizationId, t.tripId, b)) {
                is ApiResult.Ok -> _state.update { it.copy(rooming = roomingOf(r.value), syncing = false, error = null) }
                is ApiResult.Failed -> _state.update { it.copy(syncing = false, error = trf(Txt.ROOMING_LOAD_FAILED, r.error.code)) }
                is ApiResult.Unreachable -> _state.update { it.copy(rooming = it.rooming.withOffline(true), syncing = false, error = tr(Txt.ROOMING_OFFLINE)) }
            }
        }
    }
}
