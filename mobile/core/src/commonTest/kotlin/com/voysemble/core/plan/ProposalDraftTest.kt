// Copyright 2026- At Day. All rights reserved.
// Facts (slice 035): the draft rule names what is missing (note, event, title, clocks, day); an
// edit posts only the start the leader set, a remove posts an empty patch, an add posts the whole
// event with explicit nulls (the server treats an absent end, pax or note as incomplete) after
// the day's last slot; the messages for 403, other failures and offline are fixed strings.

package com.voysemble.core.plan

import com.voysemble.core.api.ApiClient
import com.voysemble.core.api.ApiClientConfig
import com.voysemble.core.api.ApiResult
import com.voysemble.core.api.ItineraryProposalDto
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
import kotlin.test.assertNull

class ProposalDraftTest {
    private val config = ApiClientConfig(host = "test.dev.voysemble.cfd", userAgent = "test", sessionToken = { "tok-1" })

    @Test
    fun the_rule_names_what_is_missing() {
        assertEquals("Say why in a line.", proposalDraftProblem(ProposalDraft(ProposalKind.EDIT, "e1", "  ")))
        assertEquals("Pick an event.", proposalDraftProblem(ProposalDraft(ProposalKind.EDIT, null, "Why")))
        assertEquals("The new start must be HH:mm.", proposalDraftProblem(ProposalDraft(ProposalKind.EDIT, "e1", "Why", start = "7am")))
        assertNull(proposalDraftProblem(ProposalDraft(ProposalKind.EDIT, "e1", "Why", start = "")))
        assertNull(proposalDraftProblem(ProposalDraft(ProposalKind.EDIT, "e1", "Why", start = "07:00")))
        assertEquals("Pick an event.", proposalDraftProblem(ProposalDraft(ProposalKind.REMOVE, "", "Why")))
        assertNull(proposalDraftProblem(ProposalDraft(ProposalKind.REMOVE, "e1", "Why")))
        val add = ProposalDraft(ProposalKind.ADD, null, "Why", start = "18:00", title = "Gelato", date = "2026-12-31", timeZone = "Europe/Rome", order = 8)
        assertNull(proposalDraftProblem(add))
        assertEquals("Give the event a title.", proposalDraftProblem(add.copy(title = " ")))
        assertEquals("The start must be HH:mm.", proposalDraftProblem(add.copy(start = "24:00")))
        assertEquals("The end must be HH:mm.", proposalDraftProblem(add.copy(end = "x")))
        assertEquals("Pick a day.", proposalDraftProblem(add.copy(date = null)))
        assertEquals("Only trip leaders propose changes.", proposalFailureMessage(403, "FORBIDDEN"))
        assertEquals("Could not send the proposal (RATE_LIMITED).", proposalFailureMessage(429, "RATE_LIMITED"))
        assertEquals("Offline. Try again when connected.", PROPOSAL_OFFLINE_MESSAGE)
        assertEquals("New event proposed to the organizer", proposalSentMessage(ProposalKind.ADD))
    }

    @Test
    fun edit_remove_and_add_post_their_bodies() = runTest {
        val bodies = mutableListOf<String>()
        val engine = MockEngine { req ->
            bodies += (req.body as TextContent).text
            assertEquals("https://test.dev.voysemble.cfd/v1/orgs/o/trips/t/itinerary/proposals", req.url.toString())
            respond(
                """{"id":"11111111-1111-4111-8111-111111111111","tripId":"t","kind":"edit","eventId":"e1","eventTitle":"Colosseum","patch":{},"note":"Why","status":"pending","proposedByName":"Kim","proposedAt":"2026-12-31T06:00:00.000Z","decidedAt":null,"decidedByName":null,"decisionNote":null}""",
                HttpStatusCode.Created,
                headersOf(HttpHeaders.ContentType, "application/json"),
            )
        }
        val api = ApiClient(config, engine)
        val edit = api.sendProposal("o", "t", ProposalDraft(ProposalKind.EDIT, "e1", " Earlier. ", start = " 07:00 "))
        assertIs<ApiResult.Ok<ItineraryProposalDto>>(edit)
        api.sendProposal("o", "t", ProposalDraft(ProposalKind.REMOVE, "e1", "Rained out"))
        api.sendProposal(
            "o", "t",
            ProposalDraft(ProposalKind.ADD, null, "A treat", start = "18:00", end = " ", title = " Gelato ", place = "Giolitti", date = "2026-12-31", timeZone = "Europe/Rome", order = 8),
        )
        assertEquals(
            listOf(
                """{"kind":"edit","eventId":"e1","patch":{"start":"07:00"},"note":"Earlier."}""",
                """{"kind":"remove","eventId":"e1","patch":{},"note":"Rained out"}""",
                """{"kind":"add","eventId":null,"patch":{"date":"2026-12-31","start":"18:00","end":null,"timeZone":"Europe/Rome","kind":"activity","title":"Gelato","place":"Giolitti","pax":null,"status":"scheduled","note":null,"order":8},"note":"A treat"}""",
            ),
            bodies,
        )
    }
}
