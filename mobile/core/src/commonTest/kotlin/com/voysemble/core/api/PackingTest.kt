// Copyright 2026- At Day. All rights reserved.
// Facts (D38, slice 048): my packing list decodes as the Worker sends it; a tick request encodes.

package com.voysemble.core.api

import kotlinx.serialization.json.Json
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class PackingTest {
    private val json = Json { ignoreUnknownKeys = true }

    @Test
    fun decodes_my_list_and_encodes_a_tick() {
        val list = json.decodeFromString<MyPackingListDto>(
            """{"travelerParticipationId":"p1","travelerName":"Minji Park","packingFor":"self","items":[{"id":"a","name":"Passport + copy","note":"","packed":true,"packedAt":"2026-12-20T09:00:00.000Z"},{"id":"b","name":"EU plug adapter","note":"Type C or F","packed":false,"packedAt":null}],"packed":1,"total":2,"extra":true}""",
        )
        assertEquals(2, list.items.size)
        assertEquals("Type C or F", list.items[1].note)
        assertNull(list.items[1].packedAt)
        assertEquals("""{"packed":true}""", Json.encodeToString(SetPackedRequestDto.serializer(), SetPackedRequestDto(true)))
    }
}
