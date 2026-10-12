// Copyright 2026- At Day. All rights reserved.
// Today screen state holder. Owns: the TodaySnapshot (from core), local ack queueing, tab
// selection, and in live mode (slice 017) the itinerary fetch that builds today's snapshot from
// the published revision. Rules stay in core. Without a trip it shows the fixture (sample mode).

package com.voysemble.app.today

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.voysemble.core.api.ApiClient
import com.voysemble.core.api.ApiResult
import com.voysemble.core.api.CareNoteDto
import com.voysemble.core.api.CareNoteStatusDto
import com.voysemble.core.fixtures.KoreaConcertTourFixture
import com.voysemble.core.plan.PROPOSAL_OFFLINE_MESSAGE
import com.voysemble.core.plan.ProposalDraft
import com.voysemble.core.plan.ProposalKind
import com.voysemble.core.plan.proposalDraftProblem
import com.voysemble.core.plan.proposalFailureMessage
import com.voysemble.core.plan.sendProposal
import com.voysemble.core.session.ActiveTrip
import com.voysemble.core.today.GuardianCard
import com.voysemble.core.today.TodaySnapshot
import com.voysemble.core.today.acknowledgeAnnouncement
import com.voysemble.core.today.confirmAcknowledgment
import com.voysemble.core.today.emptyTodaySnapshot
import com.voysemble.core.today.guardianCardOf
import com.voysemble.core.today.latestRequiredAck
import com.voysemble.core.today.toTodayAnnouncement
import com.voysemble.core.today.todaySnapshotOf
import com.voysemble.core.today.withAnnouncement
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter

enum class MainTab { TODAY, PLAN, BULLETIN, CHATS, MEMORIES }

/** The leader's change proposal in flight (D24): one at a time, result shown on the card. */
data class ProposalState(val eventId: String, val sending: Boolean, val sent: Boolean, val error: String? = null, val kind: ProposalKind = ProposalKind.EDIT)

data class TodayUiState(
    val snapshot: TodaySnapshot,
    val tab: MainTab = MainTab.TODAY,
    val live: Boolean = false,
    val syncing: Boolean = false,
    val error: String? = null,
    val proposal: ProposalState? = null,
    /** D24: leaders propose; travelers and guardians only read. Sample mode shows the affordance. */
    val canPropose: Boolean = false,
    /** D13: a guardian sees their traveler's status instead of the head count card and leader links. */
    val guardian: GuardianCard? = null,
    /** D27 (slice 032): the guardian's own entry of the care note. Null until the status is known. */
    val care: GuardianCareState? = null,
)

/** The guardian's care-note panel: content-free status, the note while editing, one message line. */
data class GuardianCareState(
    val travelerId: String,
    val status: CareNoteStatusDto,
    /** The note being edited (prefilled from an audited reveal); null when not editing. */
    val draft: CareNoteDto? = null,
    val saving: Boolean = false,
    val message: String? = null,
)

class TodayViewModel(
    initial: TodaySnapshot = KoreaConcertTourFixture.today(),
    private val api: ApiClient? = null,
    private val trip: ActiveTrip? = null,
    /** Device date (YYYY-MM-DD) and clock (HH:mm) in the trip's zone; injected for tests. */
    private val deviceDate: (zone: String) -> String = { zone -> LocalDate.now(zoneOf(zone)).toString() },
    private val deviceClock: (zone: String) -> String = { zone -> LocalTime.now(zoneOf(zone)).format(HH_MM) },
    /** Reader's language for the guardian card ("ko" or "en"). */
    private val locale: String = java.util.Locale.getDefault().language,
) : ViewModel() {
    private val _state = MutableStateFlow(
        TodayUiState(
            snapshot = if (trip != null && api != null) emptyTodaySnapshot(trip.tripName) else initial,
            live = trip != null && api != null,
            canPropose = trip == null || trip.role == "leader",
        ),
    )
    val state: StateFlow<TodayUiState> = _state

    /** The first itinerary fetch (live mode); completed at once in sample mode. Tests await it. */
    val ready: Job = if (_state.value.live) refresh() else Job().also { it.complete() }

    /** Local first (PENDING); in live mode one ack POST confirms it (the bulletin outbox replays the rest). */
    fun acknowledge(announcementId: String): Job {
        _state.update { it.copy(snapshot = it.snapshot.acknowledgeAnnouncement(announcementId)) }
        val a = api ?: return Job().also { it.complete() }
        val t = trip ?: return Job().also { it.complete() }
        return viewModelScope.launch {
            when (a.ackAnnouncement(t.organizationId, t.tripId, announcementId, java.time.Instant.now().toString())) {
                is ApiResult.Ok -> _state.update { it.copy(snapshot = it.snapshot.confirmAcknowledgment(announcementId)) }
                else -> Unit // stays PENDING; the Bulletin tab's outbox replay sends it later
            }
        }
    }

    fun selectTab(tab: MainTab) {
        _state.update { it.copy(tab = tab) }
    }

    /**
     * Propose a change (D24): a new start, a removal, or a new event (slice 035). The draft is
     * untouched until the organizer accepts. Sample mode shows the sent state without a network
     * call; an incomplete draft shows what is missing. Returns the job so tests can await it.
     */
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
                is ApiResult.Unreachable -> ProposalState(eventId, sending = false, sent = false, error = PROPOSAL_OFFLINE_MESSAGE, kind = draft.kind)
            }
            _state.update { it.copy(proposal = outcome) }
        }
    }

    /** The slice 018 shape: a new start (optional) and a note for one event. */
    fun propose(eventId: String, newStart: String?, note: String): Job =
        propose(ProposalDraft(ProposalKind.EDIT, eventId, note, start = newStart))

    fun dismissProposal() {
        _state.update { it.copy(proposal = null) }
    }

    fun refresh(): Job {
        val a = api ?: return Job().also { it.complete() }
        val t = trip ?: return Job().also { it.complete() }
        _state.update { it.copy(syncing = true, error = null) }
        return viewModelScope.launch {
            when (val r = a.getItinerary(t.organizationId, t.tripId)) {
                is ApiResult.Ok -> {
                    val zone = r.value.days.firstOrNull()?.timeZone ?: "UTC"
                    // D19/D16: the required-ack announcement that rides on Today (rule in core, shared with iOS).
                    val latest = when (val list = a.listAnnouncements(t.organizationId, t.tripId)) {
                        is ApiResult.Ok -> latestRequiredAck(list.value.announcements)
                        else -> null
                    }
                    // D13: guardians get their traveler's status (never coordinates) on the same screen.
                    var travelerId: String? = null
                    val guardian = if (t.role == "guardian") {
                        when (val g = a.guardianStatus(t.organizationId, t.tripId)) {
                            is ApiResult.Ok -> {
                                travelerId = g.value.traveler.participationId
                                guardianCardOf(g.value, locale, ::localTime)
                            }
                            else -> null
                        }
                    } else {
                        null
                    }
                    _state.update {
                        it.copy(
                            snapshot = todaySnapshotOf(r.value, deviceDate(zone), deviceClock(zone), minutesSinceSync = 0)
                                .withAnnouncement(latest?.toTodayAnnouncement(::localTime)),
                            guardian = guardian ?: it.guardian,
                            syncing = false,
                        )
                    }
                    if (travelerId != null) loadCare(a, t, travelerId)
                }
                is ApiResult.Failed -> _state.update { it.copy(syncing = false, error = "Could not load the itinerary (${r.error.code}).") }
                is ApiResult.Unreachable -> _state.update { it.copy(syncing = false, snapshot = it.snapshot.copy(offline = true)) }
            }
        }
    }

    // ---- Care note, guardian entry (D27, slice 032) -------------------------------------------

    private suspend fun loadCare(a: ApiClient, t: ActiveTrip, travelerId: String) {
        when (val r = a.careNoteStatus(t.organizationId, t.tripId, travelerId)) {
            is ApiResult.Ok -> _state.update { it.copy(care = GuardianCareState(travelerId, r.value, draft = it.care?.draft, message = it.care?.message)) }
            else -> Unit
        }
    }

    /** Start editing: an existing note is revealed (audited) to prefill the fields; a new one starts blank. */
    fun editCare(): Job {
        val a = api ?: return Job().also { it.complete() }
        val t = trip ?: return Job().also { it.complete() }
        val care = _state.value.care ?: return Job().also { it.complete() }
        if (!care.status.hasCareNote) {
            _state.update { it.copy(care = care.copy(draft = CareNoteDto(), message = null)) }
            return Job().also { it.complete() }
        }
        return viewModelScope.launch {
            when (val r = a.revealCareNote(t.organizationId, t.tripId, care.travelerId)) {
                is ApiResult.Ok -> _state.update { it.copy(care = it.care?.copy(draft = r.value.note, message = null)) }
                is ApiResult.Failed -> _state.update { it.copy(care = it.care?.copy(message = "Could not open the care note (${r.error.code}).")) }
                is ApiResult.Unreachable -> _state.update { it.copy(care = it.care?.copy(message = "Offline. The care note needs one connection.")) }
            }
        }
    }

    fun cancelCare() = _state.update { it.copy(care = it.care?.copy(draft = null, message = null)) }

    /** Save (a blank note clears it). The content is sealed on the server; the phone keeps nothing. */
    fun saveCare(note: CareNoteDto): Job {
        val a = api ?: return Job().also { it.complete() }
        val t = trip ?: return Job().also { it.complete() }
        val care = _state.value.care ?: return Job().also { it.complete() }
        _state.update { it.copy(care = care.copy(saving = true, message = null)) }
        return viewModelScope.launch {
            when (val r = a.putCareNote(t.organizationId, t.tripId, care.travelerId, note)) {
                is ApiResult.Ok -> _state.update {
                    it.copy(care = GuardianCareState(care.travelerId, r.value, draft = null, message = if (r.value.hasCareNote) "Care note saved. Leaders of ${it.guardian?.groupName ?: "the group"} can reveal it." else "Care note cleared."))
                }
                is ApiResult.Failed -> _state.update { it.copy(care = care.copy(saving = false, message = "Could not save the care note (${r.error.code}).")) }
                is ApiResult.Unreachable -> _state.update { it.copy(care = care.copy(saving = false, message = "Offline. The care note was not saved.")) }
            }
        }
    }

    private fun localTime(iso: String): String =
        try { HH_MM.withZone(ZoneId.systemDefault()).format(java.time.Instant.parse(iso)) } catch (_: Exception) { iso }

    companion object {
        private val HH_MM: DateTimeFormatter = DateTimeFormatter.ofPattern("HH:mm")

        private fun zoneOf(zone: String): ZoneId = try { ZoneId.of(zone) } catch (_: Exception) { ZoneId.systemDefault() }
    }
}
