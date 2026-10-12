// Copyright 2026- At Day. All rights reserved.
// Drives the top-level route from the core SessionState: sign-in, invite, or the app. "Sample
// mode" lets anyone browse the fixture screens without an account (honest: every sample screen
// carries the chip).

package com.voysemble.app.session

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.voysemble.core.api.ApiResult
import com.voysemble.core.session.SessionManager
import com.voysemble.core.session.SessionState
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class SessionUiState(
    val session: SessionState,
    val sampleMode: Boolean = false,
    val busy: Boolean = false,
    /** Safe, user-facing message from the last failed call (with its support reference). */
    val error: String? = null,
    /** D28: the organizer revoked this phone; the sign-in screen says so until the next attempt. */
    val revokedNotice: Boolean = false,
)

class SessionViewModel(private val manager: SessionManager) : ViewModel() {
    private val _state = MutableStateFlow(SessionUiState(manager.current(), revokedNotice = manager.revokedNotice()))
    val state: StateFlow<SessionUiState> = _state

    init {
        // A wipe can land inside any screen's call; the route changes at once.
        manager.onWiped = { _state.update { it.copy(session = manager.current(), revokedNotice = manager.revokedNotice(), sampleMode = false) } }
    }

    fun enterSampleMode() = _state.update { it.copy(sampleMode = true, error = null) }
    fun leaveSampleMode() = _state.update { it.copy(sampleMode = false) }

    /** Each action returns its Job so callers (tests, screens) can await completion. */
    fun requestLink(email: String, locale: String = "ko"): Job = run {
        when (val r = manager.requestLink(email, locale)) {
            is ApiResult.Ok -> Unit
            is ApiResult.Failed -> fail("${r.error.message} (ref ${r.error.correlationId})")
            is ApiResult.Unreachable -> fail("Could not reach the server. Check your connection.")
        }
    }

    fun verify(linkOrToken: String): Job = run {
        when (val r = manager.verify(linkOrToken)) {
            is ApiResult.Ok -> Unit
            is ApiResult.Failed -> fail(if (r.status == 401) "This link does not work any more. Request a new one." else "${r.error.message} (ref ${r.error.correlationId})")
            is ApiResult.Unreachable -> fail(if (r.reason == "no-token") "Paste the whole link from the email." else "Could not reach the server. Check your connection.")
        }
    }

    fun redeem(code: String): Job = run {
        when (val r = manager.redeem(code)) {
            is ApiResult.Ok -> Unit
            is ApiResult.Failed -> fail(
                when (r.status) {
                    404 -> "That code is not valid or has expired."
                    409 -> "That code was already used."
                    else -> "${r.error.message} (ref ${r.error.correlationId})"
                },
            )
            is ApiResult.Unreachable -> fail("Could not reach the server. Check your connection.")
        }
    }

    fun signOut(): Job = run { manager.signOut() }

    private fun fail(message: String) = _state.update { it.copy(error = message) }

    private fun run(block: suspend () -> Unit): Job {
        _state.update { it.copy(busy = true, error = null) }
        return viewModelScope.launch {
            try {
                block()
            } finally {
                _state.update { it.copy(busy = false, session = manager.current(), revokedNotice = manager.revokedNotice()) }
            }
        }
    }
}
