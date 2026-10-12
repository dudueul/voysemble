// Copyright 2026- At Day. All rights reserved.
// Drives the top-level route from the core SessionState: sign-in, invite, or the app. "Sample
// mode" lets anyone browse the fixture screens without an account (honest: every sample screen
// carries the chip).

package com.voysemble.app.session

import com.voysemble.core.i18n.Txt
import com.voysemble.core.i18n.tr
import com.voysemble.core.i18n.trf
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
            is ApiResult.Failed -> fail(trf(Txt.AUTH_REF, r.error.message, r.error.correlationId))
            is ApiResult.Unreachable -> fail(tr(Txt.AUTH_UNREACHABLE))
        }
    }

    fun verify(linkOrToken: String): Job = run {
        when (val r = manager.verify(linkOrToken)) {
            is ApiResult.Ok -> Unit
            is ApiResult.Failed -> fail(if (r.status == 401) tr(Txt.AUTH_LINK_DEAD) else "${r.error.message} (ref ${r.error.correlationId})")
            is ApiResult.Unreachable -> fail(if (r.reason == "no-token") tr(Txt.AUTH_PASTE_WHOLE) else tr(Txt.AUTH_UNREACHABLE))
        }
    }

    fun redeem(code: String): Job = run {
        when (val r = manager.redeem(code)) {
            is ApiResult.Ok -> Unit
            is ApiResult.Failed -> fail(
                when (r.status) {
                    404 -> tr(Txt.AUTH_CODE_INVALID)
                    409 -> tr(Txt.AUTH_CODE_USED)
                    else -> trf(Txt.AUTH_REF, r.error.message, r.error.correlationId)
                },
            )
            is ApiResult.Unreachable -> fail(tr(Txt.AUTH_UNREACHABLE))
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
