// Copyright 2026- At Day. All rights reserved.
//
// Push device wire types (mirror of packages/contracts/src/notifications.ts; D29, slice 088). A
// signed-in phone registers its APNs or FCM token for its own session (`PUT /v1/me/push-device`)
// and removes it (`DELETE /v1/me/push-device`). The server decides what is pushed and when.

package com.voysemble.core.api

import kotlinx.serialization.Serializable

@Serializable
public data class RegisterPushDeviceRequestDto(
    /** ios | android */
    val platform: String,
    val token: String,
    /** iOS only: sandbox for debug builds, production for TestFlight and the store. */
    val apnsEnvironment: String? = null,
)

@Serializable
public data class PushDeviceDto(
    val platform: String,
    val registeredAt: String,
)

@Serializable
public data class PushDeviceRemovedDto(
    val removed: Int,
)
