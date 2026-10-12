// Copyright 2026- At Day. All rights reserved.
// Packing checklist state holder (D38, slice 048). Live with a client and a trip: my list from
// the API (a traveler's or leader's own, a guardian's for their traveler), a tick flipped on the
// phone first and confirmed by the server's answer (a failure or no connection puts it back and
// says so). Without a trip: the fixture list. Rules in core (packing/PackingModel.kt).

package com.voysemble.app.packing

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.voysemble.core.api.ApiClient
import com.voysemble.core.api.ApiResult
import com.voysemble.core.fixtures.KoreaConcertTourFixture
import com.voysemble.core.i18n.Txt
import com.voysemble.core.i18n.tr
import com.voysemble.core.i18n.trf
import com.voysemble.core.packing.PackingItem
import com.voysemble.core.packing.PackingList
import com.voysemble.core.packing.emptyPackingList
import com.voysemble.core.packing.packingOf
import com.voysemble.core.packing.replaceItem
import com.voysemble.core.packing.withOffline
import com.voysemble.core.packing.withPacked
import com.voysemble.core.session.ActiveTrip
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.time.Instant

data class PackingUiState(
    val list: PackingList,
    val live: Boolean = false,
    val syncing: Boolean = false,
    val error: String? = null,
    /** One line after a tick that did not reach the server. */
    val notice: String? = null,
    /** Items whose tick is on its way; their rows are disabled meanwhile. */
    val pending: Set<String> = emptySet(),
)

class PackingViewModel(
    initial: PackingList = KoreaConcertTourFixture.packing(),
    private val api: ApiClient? = null,
    private val trip: ActiveTrip? = null,
    private val nowIso: () -> String = { Instant.now().toString() },
) : ViewModel() {
    private val live = api != null && trip != null
    private val _state = MutableStateFlow(PackingUiState(list = if (live) emptyPackingList() else initial, live = live))
    val state: StateFlow<PackingUiState> = _state

    /** The first list (live); completed at once in sample mode. Tests await it. */
    val ready: Job = if (live) refresh() else Job().also { it.complete() }

    fun refresh(): Job {
        val a = api ?: return Job().also { it.complete() }
        val t = trip ?: return Job().also { it.complete() }
        _state.update { it.copy(syncing = true) }
        return viewModelScope.launch {
            when (val r = a.myPacking(t.organizationId, t.tripId)) {
                is ApiResult.Ok -> _state.update { it.copy(list = packingOf(r.value), syncing = false, error = null) }
                is ApiResult.Failed -> _state.update { it.copy(syncing = false, error = trf(Txt.PACK_LOAD_FAILED, r.error.code)) }
                is ApiResult.Unreachable -> _state.update { it.copy(list = it.list.withOffline(true), syncing = false, error = tr(Txt.PACK_OFFLINE)) }
            }
        }
    }

    /** Flip locally first; the server's item replaces it, a failure puts the old one back. */
    fun setPacked(itemId: String, packed: Boolean): Job {
        val before = _state.value.list.items.firstOrNull { it.id == itemId }
        _state.update { it.copy(list = it.list.withPacked(itemId, packed, nowIso()), notice = null) }
        val a = api ?: return Job().also { it.complete() }
        val t = trip ?: return Job().also { it.complete() }
        _state.update { it.copy(pending = it.pending + itemId) }
        return viewModelScope.launch {
            val r = a.setPacked(t.organizationId, t.tripId, itemId, packed)
            _state.update { s ->
                val done = s.pending - itemId
                when (r) {
                    is ApiResult.Ok -> s.copy(list = s.list.replaceItem(PackingItem(r.value.id, r.value.name, r.value.note, r.value.packed, r.value.packedAt)), pending = done)
                    is ApiResult.Failed -> s.copy(list = before?.let { s.list.replaceItem(it) } ?: s.list, notice = trf(Txt.PACK_TICK_FAILED, r.error.code), pending = done)
                    is ApiResult.Unreachable -> s.copy(list = (before?.let { s.list.replaceItem(it) } ?: s.list).withOffline(true), notice = tr(Txt.PACK_TICK_OFFLINE), pending = done)
                }
            }
        }
    }
}
