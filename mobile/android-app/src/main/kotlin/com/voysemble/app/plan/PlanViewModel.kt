// Copyright 2026- At Day. All rights reserved.
// Plan tab state holder (slice 035). Live with a client and a trip: the published itinerary as
// a day-by-day plan (core plan/PlanModel.kt), the device date's day opened first, and a leader's
// proposals (change, remove, add) sent through core. Without a trip: the fixture plan on its
// own day. The phone never edits the itinerary (D24).

package com.voysemble.app.plan

import com.voysemble.core.i18n.Txt
import com.voysemble.core.i18n.trf
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.voysemble.app.today.ProposalState
import com.voysemble.core.api.ApiClient
import com.voysemble.core.api.ApiResult
import com.voysemble.core.fixtures.KoreaConcertTourFixture
import com.voysemble.core.plan.proposalOfflineMessage
import com.voysemble.core.plan.ProposalDraft
import com.voysemble.core.plan.TripPlan
import com.voysemble.core.plan.emptyTripPlan
import com.voysemble.core.plan.initialDayIndex
import com.voysemble.core.plan.planOf
import com.voysemble.core.plan.proposalDraftProblem
import com.voysemble.core.plan.proposalFailureMessage
import com.voysemble.core.plan.sendProposal
import com.voysemble.core.plan.withOffline
import com.voysemble.core.session.ActiveTrip
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.ZoneId

data class PlanUiState(
    val plan: TripPlan,
    /** Index into `plan.days`; 0 on an empty plan. */
    val selected: Int = 0,
    val live: Boolean = false,
    val syncing: Boolean = false,
    val error: String? = null,
    /** D24: leaders propose; travelers and guardians only read. Sample mode shows the affordance. */
    val canPropose: Boolean = false,
    val proposal: ProposalState? = null,
)

class PlanViewModel(
    initial: TripPlan = KoreaConcertTourFixture.plan(),
    private val api: ApiClient? = null,
    private val trip: ActiveTrip? = null,
    /** Device date (YYYY-MM-DD) in a zone; injected for tests. */
    private val deviceDate: (zone: String) -> String = { zone -> LocalDate.now(zoneOf(zone)).toString() },
) : ViewModel() {
    private val live = trip != null && api != null
    private val _state = MutableStateFlow(
        PlanUiState(
            plan = if (live) emptyTripPlan(trip!!.tripName) else initial,
            selected = if (live) 0 else initial.initialDayIndex(KoreaConcertTourFixture.TODAY_DATE),
            live = live,
            canPropose = trip == null || trip.role == "leader",
        ),
    )
    val state: StateFlow<PlanUiState> = _state

    /** The first itinerary fetch (live mode); completed at once in sample mode. Tests await it. */
    val ready: Job = if (live) refresh() else Job().also { it.complete() }

    fun refresh(): Job {
        val a = api ?: return Job().also { it.complete() }
        val t = trip ?: return Job().also { it.complete() }
        _state.update { it.copy(syncing = true) }
        return viewModelScope.launch {
            when (val r = a.getItinerary(t.organizationId, t.tripId)) {
                is ApiResult.Ok -> {
                    val plan = planOf(r.value, minutesSinceSync = 0)
                    _state.update { s ->
                        // Open the device date's day on the first answer; keep the reader's choice after.
                        val selected = if (s.plan.days.isEmpty()) plan.initialDayIndex(deviceDate(plan.days.firstOrNull()?.timeZone ?: "UTC")) else s.selected.coerceIn(0, plan.days.lastIndex.coerceAtLeast(0))
                        s.copy(plan = plan, selected = selected, syncing = false, error = null)
                    }
                }
                is ApiResult.Failed -> _state.update { it.copy(syncing = false, error = trf(Txt.PLAN_LOAD_FAILED, r.error.code)) }
                is ApiResult.Unreachable -> _state.update { it.copy(plan = it.plan.withOffline(true), syncing = false) }
            }
        }
    }

    fun selectDay(index: Int) {
        _state.update { it.copy(selected = index.coerceIn(0, it.plan.days.lastIndex.coerceAtLeast(0))) }
    }

    /** Same contract as TodayViewModel.propose: sample mode shows "sent", a bad draft says why. */
    fun propose(draft: ProposalDraft): Job {
        val eventId = draft.eventId ?: ""
        val a = api
        val t = trip
        if (a == null || t == null) {
            _state.update { it.copy(proposal = ProposalState(eventId, sending = false, sent = true, kind = draft.kind)) }
            return Job().also { it.complete() }
        }
        proposalDraftProblem(draft)?.let { problem ->
            _state.update { it.copy(proposal = ProposalState(eventId, sending = false, sent = false, error = problem, kind = draft.kind)) }
            return Job().also { it.complete() }
        }
        _state.update { it.copy(proposal = ProposalState(eventId, sending = true, sent = false, kind = draft.kind)) }
        return viewModelScope.launch {
            val outcome = when (val r = a.sendProposal(t.organizationId, t.tripId, draft)) {
                is ApiResult.Ok -> ProposalState(eventId, sending = false, sent = true, kind = draft.kind)
                is ApiResult.Failed -> ProposalState(eventId, sending = false, sent = false, error = proposalFailureMessage(r.status, r.error.code), kind = draft.kind)
                is ApiResult.Unreachable -> ProposalState(eventId, sending = false, sent = false, error = proposalOfflineMessage(), kind = draft.kind)
            }
            _state.update { it.copy(proposal = outcome) }
        }
    }

    fun dismissProposal() {
        _state.update { it.copy(proposal = null) }
    }

    companion object {
        private fun zoneOf(zone: String): ZoneId = runCatching { ZoneId.of(zone) }.getOrDefault(ZoneId.systemDefault())
    }
}
