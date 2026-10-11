// Copyright 2026- At Day. All rights reserved.
// Facts: a proposal posts kind, event id, note, and only the patch fields the leader set (the
// untouched ones are absent, not null: the server would read null as "clear" or reject it), with
// the bearer token; the created proposal decodes with its status and event title.

package com.voysemble.core.api

import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.content.TextContent
import io.ktor.http.headersOf
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs

class ProposalsTest {
    private val config = ApiClientConfig(host = "test.dev.voysemble.cfd", userAgent = "test", sessionToken = { "tok-1" })

    @Test
    fun create_posts_kind_event_patch_note() = runTest {
        var body: String? = null
        val engine = MockEngine { req ->
            body = (req.body as TextContent).text
            assertEquals("https://test.dev.voysemble.cfd/v1/orgs/o/trips/t/itinerary/proposals", req.url.toString())
            respond(
                """{"id":"11111111-1111-4111-8111-111111111111","tripId":"t","kind":"edit","eventId":"e1","eventTitle":"Colosseum","patch":{"start":"08:30"},"note":"Earlier.","status":"pending","proposedByName":"Kim","proposedAt":"2026-12-31T06:00:00.000Z","decidedAt":null,"decidedByName":null,"decisionNote":null}""",
                HttpStatusCode.Created,
                headersOf(HttpHeaders.ContentType, "application/json"),
            )
        }
        val r = ApiClient(config, engine).createProposal("o", "t", CreateProposalRequestDto("edit", "e1", ProposalPatchDto(start = "08:30"), "Earlier."))
        val ok = assertIs<ApiResult.Ok<ItineraryProposalDto>>(r)
        assertEquals("pending", ok.value.status)
        assertEquals("Colosseum", ok.value.eventTitle)
        assertEquals("""{"kind":"edit","eventId":"e1","patch":{"start":"08:30"},"note":"Earlier."}""", body)
    }
}
