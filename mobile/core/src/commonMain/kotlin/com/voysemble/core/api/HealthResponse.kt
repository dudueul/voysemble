// Copyright 2026- At Day. All rights reserved.
//
// Mirror of the `HealthResponse` contract (packages/contracts/src/health.ts). Hand-written for
// slice 002; replaced by OpenAPI-generated models in a later slice. Field names and types must
// match the Zod schema exactly.

package com.voysemble.core.api

import kotlinx.serialization.Serializable

@Serializable
public data class HealthResponse(
    val status: String,
    val service: String,
    val envName: String,
    val buildId: String,
    val time: String,
)
