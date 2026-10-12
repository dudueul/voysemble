// Copyright 2026- At Day. All rights reserved.
//
// Mirror of the shared `ErrorEnvelope` contract (packages/contracts/src/error.ts) and the typed
// failure the client surfaces to UI. Expected failures are values, not exceptions.

package com.voysemble.core.api

import kotlinx.serialization.Serializable

@Serializable
public data class ErrorEnvelope(val error: ErrorBody)

@Serializable
public data class ErrorBody(
    val code: String,
    val message: String,
    val correlationId: String,
    val details: List<ErrorDetail> = emptyList(),
)

@Serializable
public data class ErrorDetail(val path: String, val message: String)

/** Outcome of an API call. UI switches on this; it never catches transport exceptions itself. */
public sealed interface ApiResult<out T> {
    public data class Ok<T>(val value: T, val correlationId: String?) : ApiResult<T>

    /**
     * Server answered with an ErrorEnvelope. `wiped` is the D28 directive: the organizer revoked
     * this device; the client has already cleared its session when this is true.
     */
    public data class Failed(val status: Int, val error: ErrorBody, val wiped: Boolean = false) : ApiResult<Nothing>

    /** No usable answer: offline, timeout, TLS, or a body that is not our envelope. */
    public data class Unreachable(val reason: String) : ApiResult<Nothing>
}
