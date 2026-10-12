// Copyright 2026- At Day. All rights reserved.
//
// Native session lifecycle shared by Android and iOS (ADR-0007, D21): magic-link request and
// verify, invite redeem, active trip selection, sign-out. State is derived from the secure
// store so a relaunch resumes where the user was. All I/O goes through ApiClient; nothing here
// touches the platform.

package com.voysemble.core.session

import com.voysemble.core.api.ApiClient
import com.voysemble.core.api.ApiResult
import com.voysemble.core.api.MyParticipationDto

/** What the app should show. */
public sealed interface SessionState {
    public data object SignedOut : SessionState

    /** A link was requested; the user pastes the link or token from the email. */
    public data class AwaitingLink(val email: String) : SessionState

    /** Signed in but not on any trip yet: show the invite-code screen. */
    public data class NeedsInvite(val accountId: String, val email: String) : SessionState

    public data class Ready(val accountId: String, val email: String, val trip: ActiveTrip) : SessionState
}

public data class ActiveTrip(
    val organizationId: String,
    val organizationName: String,
    val tripId: String,
    val tripName: String,
    val participationId: String,
    /** traveler | leader | guardian */
    val role: String,
)

/** Pulls a session token out of a pasted magic link (`…/auth/verify#token=…`) or a bare token. */
public fun extractMagicToken(input: String): String? {
    val t = input.trim()
    if (t.isEmpty()) return null
    val fromFragment = Regex("""(?:^|[#&])token=([A-Za-z0-9_-]{32,128})""").find(t)?.groupValues?.get(1)
    if (fromFragment != null) return fromFragment
    return if (Regex("""^[A-Za-z0-9_-]{32,128}$""").matches(t)) t else null
}

public class SessionManager(
    private val api: ApiClient,
    private val store: SecureStore,
) {
    public fun current(): SessionState {
        val token = store.get(KEY_TOKEN)
        val email = store.get(KEY_EMAIL)
        if (token == null) {
            return if (email != null && store.get(KEY_AWAITING) == "1") SessionState.AwaitingLink(email) else SessionState.SignedOut
        }
        val accountId = store.get(KEY_ACCOUNT) ?: return SessionState.SignedOut
        val trip = activeTrip() ?: return SessionState.NeedsInvite(accountId, email ?: "")
        return SessionState.Ready(accountId, email ?: "", trip)
    }

    public fun activeTrip(): ActiveTrip? {
        val org = store.get(KEY_ORG) ?: return null
        return ActiveTrip(
            organizationId = org,
            organizationName = store.get(KEY_ORG_NAME) ?: "",
            tripId = store.get(KEY_TRIP) ?: return null,
            tripName = store.get(KEY_TRIP_NAME) ?: "",
            participationId = store.get(KEY_PARTICIPATION) ?: return null,
            role = store.get(KEY_ROLE) ?: "traveler",
        )
    }

    public suspend fun requestLink(email: String, locale: String): ApiResult<Unit> =
        when (val r = api.requestMagicLink(email.trim().lowercase(), locale)) {
            is ApiResult.Ok -> {
                store.put(KEY_EMAIL, email.trim().lowercase())
                store.put(KEY_AWAITING, "1")
                store.put(KEY_REVOKED_NOTICE, null)
                ApiResult.Ok(Unit, r.correlationId)
            }
            is ApiResult.Failed -> r
            is ApiResult.Unreachable -> r
        }

    /** Accepts the pasted link or token. On success the token is stored and `current()` moves on. */
    public suspend fun verify(linkOrToken: String): ApiResult<SessionState> {
        val token = extractMagicToken(linkOrToken) ?: return ApiResult.Unreachable("no-token")
        return when (val r = api.verifyMagicLink(token)) {
            is ApiResult.Ok -> {
                val session = r.value.sessionToken ?: return ApiResult.Unreachable("no-session-token")
                store.put(KEY_TOKEN, session)
                store.put(KEY_ACCOUNT, r.value.accountId)
                store.put(KEY_EMAIL, r.value.email)
                store.put(KEY_AWAITING, null)
                // Returning users may already be on a trip: adopt the first participation.
                when (val p = api.myParticipations()) {
                    is ApiResult.Ok -> p.value.participations.firstOrNull()?.let { setActive(it) }
                    else -> Unit
                }
                ApiResult.Ok(current(), r.correlationId)
            }
            is ApiResult.Failed -> r
            is ApiResult.Unreachable -> r
        }
    }

    public suspend fun redeem(code: String): ApiResult<ActiveTrip> =
        when (val r = api.redeemInvite(code.trim())) {
            is ApiResult.Ok -> {
                val trip = ActiveTrip(
                    organizationId = r.value.organizationId,
                    organizationName = r.value.organizationName,
                    tripId = r.value.tripId,
                    tripName = "",
                    participationId = r.value.participation.id,
                    role = r.value.participation.role,
                )
                // Pull the trip name through the participation list when reachable.
                val named = when (val p = api.myParticipations()) {
                    is ApiResult.Ok -> p.value.participations.firstOrNull { it.tripId == trip.tripId }?.let { toActive(it) } ?: trip
                    else -> trip
                }
                setActive(named)
                ApiResult.Ok(named, r.correlationId)
            }
            is ApiResult.Failed -> r
            is ApiResult.Unreachable -> r
        }

    public suspend fun signOut() {
        if (store.get(KEY_TOKEN) != null) api.logout()
        clear()
        store.put(KEY_REVOKED_NOTICE, null)
    }

    /**
     * Lost or stolen device (D28): the server said this session was wiped. Forget everything local
     * at once (no logout call: the session is already dead), remember to tell the person why on
     * the sign-in screen, and notify the platform so the screen changes now.
     */
    public fun wipe() {
        clear()
        store.put(KEY_REVOKED_NOTICE, "1")
        onWiped?.invoke()
    }

    /** Set by the platform (view model) to refresh its state when `wipe()` runs mid-call. */
    public var onWiped: (() -> Unit)? = null

    /** True until the next sign-in attempt: the sign-in screen explains the revocation. */
    public fun revokedNotice(): Boolean = store.get(KEY_REVOKED_NOTICE) == "1"

    private fun clear() {
        listOf(KEY_TOKEN, KEY_ACCOUNT, KEY_AWAITING, KEY_ORG, KEY_ORG_NAME, KEY_TRIP, KEY_TRIP_NAME, KEY_PARTICIPATION, KEY_ROLE)
            .forEach { store.put(it, null) }
    }

    private fun setActive(p: MyParticipationDto) = setActive(toActive(p))

    private fun setActive(t: ActiveTrip) {
        store.put(KEY_ORG, t.organizationId)
        store.put(KEY_ORG_NAME, t.organizationName)
        store.put(KEY_TRIP, t.tripId)
        store.put(KEY_TRIP_NAME, t.tripName)
        store.put(KEY_PARTICIPATION, t.participationId)
        store.put(KEY_ROLE, t.role)
    }

    private fun toActive(p: MyParticipationDto) = ActiveTrip(
        organizationId = p.organizationId,
        organizationName = p.organizationName,
        tripId = p.tripId,
        tripName = p.tripName,
        participationId = p.participation.id,
        role = p.participation.role,
    )

    public companion object {
        public const val KEY_TOKEN: String = "session.token"
        /** "1" after a wipe until the next sign-in attempt (D28); public so screenshots can seed it. */
        public const val KEY_REVOKED_NOTICE: String = "session.revokedNotice"
        private const val KEY_ACCOUNT = "session.accountId"
        private const val KEY_EMAIL = "session.email"
        private const val KEY_AWAITING = "session.awaitingLink"
        private const val KEY_ORG = "active.orgId"
        private const val KEY_ORG_NAME = "active.orgName"
        private const val KEY_TRIP = "active.tripId"
        private const val KEY_TRIP_NAME = "active.tripName"
        private const val KEY_PARTICIPATION = "active.participationId"
        private const val KEY_ROLE = "active.role"
    }
}
