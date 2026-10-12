// Copyright 2026- At Day. All rights reserved.
// Facts: server rows map to cards (status, people, clock-rendered times, guardian text by
// locale); a local answer stays pending through a merge until confirmed; confirm posts the wire
// status and note with the bearer token; a failed post keeps the answer pending.

package com.voysemble.core.api

import com.voysemble.core.incidents.incidentKindOf
import com.voysemble.core.incidents.IncidentKind
import com.voysemble.core.incidents.ConfirmationStatus
import com.voysemble.core.incidents.IncidentFeed
import com.voysemble.core.incidents.IncidentStatus
import com.voysemble.core.incidents.confirmLocally
import com.voysemble.core.incidents.confirmed
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

class IncidentsSyncTest {
    private val config = ApiClientConfig(host = "test.dev.voysemble.cfd", userAgent = "test", sessionToken = { "tok-1" })

    private val listJson = """
        {"incidents":[
          {"id":"i1","tripId":"t","kind":"headcount_missing","status":"open","title":"Head count closed with 1 missing (Bus A, 06:58)","headcountId":"h1",
           "people":[{"participationId":"p2","displayName":"Juho Kim","groupName":"Bus A"}],"openedAt":"2026-12-31T05:58:01.000Z","openedByName":"Kim",
           "resolvedAt":null,"resolvedByName":null,"resolutionNote":null,
           "confirmations":[{"id":"c1","status":"with_group","note":"Lobby.","confirmedByName":"Kim","confirmedByRole":"leader","confirmedAt":"2026-12-31T06:10:00.000Z"}],
           "guardianMessage":{"bodyEn":"Juho Kim is with the group.","bodyKo":"Juho Kim 학생은 그룹과 함께 있습니다.","sentAt":"2026-12-31T06:12:00.000Z","sentByName":"Organizer"}},
          {"id":"i2","tripId":"t","kind":"manual","status":"resolved","title":"Phone lost","headcountId":null,
           "people":[{"participationId":"p1","displayName":"Minji Park","groupName":"Bus A"}],"openedAt":"2026-12-30T13:30:00.000Z","openedByName":"Organizer",
           "resolvedAt":"2026-12-30T14:00:00.000Z","resolvedByName":"Organizer","resolutionNote":"Found.","confirmations":[],"guardianMessage":null}
        ]}
    """.trimIndent()

    private val oneJson = """
        {"id":"i1","tripId":"t","kind":"headcount_missing","status":"open","title":"Head count closed with 1 missing (Bus A, 06:58)","headcountId":"h1",
         "people":[{"participationId":"p2","displayName":"Juho Kim","groupName":"Bus A"}],"openedAt":"2026-12-31T05:58:01.000Z","openedByName":"Kim",
         "resolvedAt":null,"resolvedByName":null,"resolutionNote":null,
         "confirmations":[{"id":"c2","status":"with_group","note":"Lobby.","confirmedByName":"Kim","confirmedByRole":"leader","confirmedAt":"2026-12-31T06:20:00.000Z"}],
         "guardianMessage":null}
    """.trimIndent()

    @Test
    fun list_maps_cards_and_merge_keeps_pending_answers() = runTest {
        val engine = MockEngine { respond(listJson, HttpStatusCode.OK, headersOf(HttpHeaders.ContentType, "application/json")) }
        val ok = assertIs<ApiResult.Ok<IncidentListDto>>(ApiClient(config, engine).listIncidents("o", "t"))
        val local = IncidentFeed(emptyList(), offline = true)
            .copy(cards = listOf(ok.value.incidents[0].toCard({ it.substring(11, 16) })))
            .confirmLocally("i1", ConfirmationStatus.NOT_WITH_GROUP, null, "Kim", "06:20")
        val merged = mergeIncidents(local, ok.value.incidents, { it.substring(11, 16) }, locale = "ko")
        assertEquals(listOf("i1", "i2"), merged.cards.map { it.id })
        val open = merged.cards[0]
        assertEquals(IncidentStatus.OPEN, open.status)
        assertEquals(listOf("Juho Kim"), open.people)
        assertEquals("05:58", open.openedAt)
        assertEquals("Juho Kim 학생은 그룹과 함께 있습니다.", open.guardianMessage)
        assertEquals(ConfirmationStatus.NOT_WITH_GROUP, open.latest?.status) // pending wins
        assertEquals("06:10", open.confirmations[0].at)
        assertEquals(false, merged.offline)
        assertEquals(IncidentStatus.RESOLVED, merged.cards[1].status)
        assertNull(merged.cards[1].guardianMessage)
        // Slice 079: the kind rides along; an unknown wire kind reads as by hand.
        assertEquals(listOf(IncidentKind.HEADCOUNT, IncidentKind.MANUAL), merged.cards.map { it.kind })
        assertEquals(IncidentKind.HELP, incidentKindOf("help"))
        assertEquals(IncidentKind.MANUAL, incidentKindOf("something-new"))

        val settled = merged.confirmed("i1")
        assertNull(settled.cards[0].pending)
        assertEquals(ConfirmationStatus.NOT_WITH_GROUP, settled.cards[0].confirmations[0].status)
        assertEquals(2, settled.cards[0].confirmations.size)
    }

    @Test
    fun confirm_posts_status_and_note_with_bearer() = runTest {
        var body: String? = null
        var auth: String? = null
        val engine = MockEngine { req ->
            body = (req.body as TextContent).text
            auth = req.headers[HttpHeaders.Authorization]
            assertEquals("https://test.dev.voysemble.cfd/v1/orgs/o/trips/t/incidents/i1/confirm", req.url.toString())
            respond(oneJson, HttpStatusCode.OK, headersOf(HttpHeaders.ContentType, "application/json"))
        }
        val r = ApiClient(config, engine).confirmIncident("o", "t", "i1", ConfirmIncidentRequestDto(ConfirmationStatus.WITH_GROUP.wireName(), "Lobby."))
        assertIs<ApiResult.Ok<IncidentDto>>(r)
        assertEquals("""{"status":"with_group","note":"Lobby."}""", body)
        assertEquals("Bearer tok-1", auth)
        val failed = ApiClient(config, MockEngine { throw IllegalStateException("offline") }).confirmIncident("o", "t", "i1", ConfirmIncidentRequestDto("unknown", null))
        assertIs<ApiResult.Unreachable>(failed)
    }

    @Test
    fun confirmRequestOf_maps_the_pending_answer_to_the_wire_body() {
        val pending = com.voysemble.core.incidents.IncidentConfirmation(com.voysemble.core.incidents.ConfirmationStatus.NOT_WITH_GROUP, "On Bus B", "Me", "07:12")
        assertEquals(ConfirmIncidentRequestDto("not_with_group", "On Bus B"), confirmRequestOf(pending))
    }
}
