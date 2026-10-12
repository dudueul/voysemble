// Copyright 2026- At Day. All rights reserved.
//
// Auth and invite wire types (mirror of packages/contracts/src/auth.ts and roster.ts). Native
// clients verify the magic link with client=native and keep the returned session token in the
// platform secure store (ADR-0007). No password, no OAuth yet.

package com.voysemble.core.api

import kotlinx.serialization.Serializable

@Serializable
public data class MagicLinkRequestDto(val email: String, val locale: String)

@Serializable
public data class MagicLinkAcceptedDto(val accepted: Boolean, val expiresInSeconds: Int)

@Serializable
public data class MagicLinkVerifyRequestDto(val token: String, val client: String = "native")

@Serializable
public data class SessionResponseDto(
    val accountId: String,
    val email: String,
    val isNewAccount: Boolean,
    val expiresAt: String,
    val sessionToken: String? = null,
)

@Serializable
public data class MembershipSummaryDto(val organizationId: String, val organizationName: String, val role: String)

@Serializable
public data class MeResponseDto(
    val accountId: String,
    val email: String,
    val locale: String,
    val memberships: List<MembershipSummaryDto>,
)

@Serializable
public data class ParticipationDto(
    val id: String,
    val tripId: String,
    val role: String,
    val displayName: String,
    val groupName: String? = null,
    val guardianOf: String? = null,
    val accountId: String? = null,
    val createdAt: String,
    /** A sealed care note is on file (D27, slice 030); the content needs an audited reveal. */
    val hasCareNote: Boolean = false,
)

@Serializable
public data class MyParticipationDto(
    val organizationId: String,
    val organizationName: String,
    val tripId: String,
    val tripName: String,
    val participation: ParticipationDto,
    /** Slice 067: the trip's days and zone (absent from an older server). */
    val startsOn: String? = null,
    val endsOn: String? = null,
    val timezone: String? = null,
)

@Serializable
public data class MyParticipationListDto(val participations: List<MyParticipationDto>)

@Serializable
public data class RedeemInviteRequestDto(val code: String)

@Serializable
public data class RedeemInviteResponseDto(
    val organizationId: String,
    val organizationName: String,
    val tripId: String,
    val participation: ParticipationDto,
)

@Serializable
public data class LogoutResponseDto(val loggedOut: Boolean)
