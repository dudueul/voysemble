// Copyright 2026- At Day. All rights reserved.
// Fact: the Kotlin model decodes the exact JSON shape the Worker emits, ignoring unknown keys.

package com.voysemble.core.api

import kotlinx.serialization.json.Json
import kotlin.test.Test
import kotlin.test.assertEquals

class HealthResponseTest {
    @Test
    fun decodes_worker_payload_and_ignores_unknown_keys() {
        val json = Json { ignoreUnknownKeys = true }
        val decoded = json.decodeFromString<HealthResponse>(
            """{"status":"ok","service":"voysemble-api","envName":"local","buildId":"local","time":"2026-10-10T19:36:40.000Z","extra":1}""",
        )
        assertEquals(HealthResponse("ok", "voysemble-api", "local", "local", "2026-10-10T19:36:40.000Z"), decoded)
    }
}
