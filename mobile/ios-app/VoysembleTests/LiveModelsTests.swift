// Copyright 2026- At Day. All rights reserved.
// Facts for the live iOS models (slice 024) without a server: a live model starts honest (empty,
// loading, no fixture), the unreachable path marks offline or says so safely, sample mode never
// calls the network, and the clock helpers format the wire times. The reachable paths are the
// same core functions the JVM tests prove (todaySnapshotOf, syncBulletin, pushHeadcount,
// mergeIncidents); the wiring is what these tests pin.

import VoysembleCore
import XCTest
@testable import Voysemble

@MainActor
final class LiveModelsTests: XCTestCase {
    /// A client that can never connect: the port is closed, the answer is `Unreachable` at once.
    private func unreachableClient() -> ApiClient {
        ApiClient(
            config: ApiClientConfig(host: "127.0.0.1:9", userAgent: "Voysemble-iOS-tests", sessionToken: { "tok" }),
            engine: DarwinEngineFactory.shared.create(),
        )
    }

    private let trip = ActiveTrip(organizationId: "org1", organizationName: "Seoul Arts High", tripId: "trip1", tripName: "Korea Concert Tour", participationId: "p-kim", role: "leader")

    func testTodayLiveStartsEmptyAndGoesOfflineWhenUnreachable() async {
        let model = TodayModel(api: unreachableClient(), trip: trip, deviceDate: { _ in "2026-12-31" }, deviceClock: { _ in "07:12" })
        XCTAssertTrue(model.live)
        XCTAssertEqual(model.snapshot.tripName, "Korea Concert Tour")
        XCTAssertEqual(model.snapshot.events.count, 0)
        XCTAssertNil(model.snapshot.minutesSinceSync)
        await model.refresh()
        XCTAssertTrue(model.snapshot.offline)
        XCTAssertNil(model.error)
        XCTAssertFalse(model.syncing)
    }

    func testGuardianCareEntryIsHonestWhenUnreachable() async {
        // Slice 032 (D27): a seeded status offers Add (blank draft); saving while unreachable says so.
        let sora = ActiveTrip(organizationId: "org1", organizationName: "Seoul Arts High", tripId: "trip1", tripName: "Korea Concert Tour", participationId: "p-sora", role: "guardian")
        let status = CareNoteStatusDto(participationId: "p1", hasCareNote: false, updatedAt: nil, updatedByName: nil, reveals: 0)
        let model = TodayModel(api: unreachableClient(), trip: sora, careStatus: status)
        await model.editCare()
        XCTAssertEqual(model.careDraft?.allergies, "")
        model.cancelCare()
        XCTAssertNil(model.careDraft)
        // No traveler id yet (the guardian status never loaded): saving is a no-op, not a crash.
        await model.saveCare(CareNoteDto(allergies: "Peanuts", medications: "", freeText: ""))
        XCTAssertNil(model.careMessage)
    }

    func testTodaySampleModeKeepsTheFixtureAndNeverSyncs() async {
        let model = TodayModel()
        XCTAssertFalse(model.live)
        XCTAssertEqual(model.snapshot.dayNumber, 4)
        await model.refresh()
        XCTAssertFalse(model.snapshot.offline)
        model.acknowledge("an_departure")
        XCTAssertEqual(model.snapshot.announcement?.ack, AckState.pending)
    }

    func testBulletinLiveMarksOfflineWhenUnreachable() async {
        let model = BulletinModel(api: unreachableClient(), trip: trip)
        XCTAssertTrue(model.live)
        XCTAssertEqual(model.feed.items.count, 0)
        await model.refresh()
        XCTAssertTrue(model.feed.offline)
    }

    func testHeadcountLiveLoadFailsSafelyWhenUnreachable() async {
        let model = HeadcountModel(api: unreachableClient(), trip: trip)
        XCTAssertTrue(model.live)
        XCTAssertTrue(model.loading)
        XCTAssertEqual(model.session.members.count, 0)
        await model.load()
        XCTAssertFalse(model.loading)
        XCTAssertEqual(model.error, "Offline. The roster needs one connection to start a count.")
    }

    func testHeadcountCareRevealSampleAndUnreachable() async {
        // Slice 030 (D27): sample mode reveals the fixture line; live and unreachable says offline, nothing cached.
        let sample = HeadcountModel()
        sample.revealCare("t1")
        XCTAssertEqual(sample.revealed["t1"], "Allergies: Peanuts · Medications: EpiPen in the red bag · Asks for it herself.")
        sample.hideCare("t1")
        XCTAssertNil(sample.revealed["t1"])
        let live = HeadcountModel(api: unreachableClient(), trip: trip)
        await live.revealCareNow("p1")
        XCTAssertNil(live.revealed["p1"])
        XCTAssertEqual(live.error, "Offline. Care notes are never cached on the device.")
    }

    func testIncidentsLiveMarksOfflineWhenUnreachable() async {
        let model = IncidentsModel(api: unreachableClient(), trip: trip)
        XCTAssertTrue(model.live)
        await model.refresh()
        XCTAssertTrue(model.feed.offline)
        XCTAssertNil(model.error)
    }

    func testMeetingWindowLiveStartsEmptyAndSaysOfflineWhenUnreachable() async {
        // Slice 029: live starts without a window (no fixture), and an unreachable server says so safely.
        let model = MeetingWindowModel(api: unreachableClient(), trip: trip, locationSource: FakeLocationSource(fix: nil))
        XCTAssertTrue(model.live)
        XCTAssertNil(model.window)
        await model.refresh()
        XCTAssertNil(model.window)
        XCTAssertEqual(model.error, "Offline. The window needs one connection.")
        XCTAssertFalse(model.syncing)
        // Without a window there is nothing to report; the switch never reaches the network.
        model.setSharing(true)
        await model.report()
        XCTAssertNil(model.window)
    }

    func testLeaderOpenWithoutAFixSendsNothingAndUnreachableSaysOffline() async {
        // Slice 032: a leader's model offers the form; no fix means no request; unreachable is honest.
        let leader = ActiveTrip(organizationId: "org1", organizationName: "Seoul Arts High", tripId: "trip1", tripName: "Korea Concert Tour", participationId: "p-kim", role: "leader")
        let noFix = MeetingWindowModel(api: unreachableClient(), trip: leader, locationSource: FakeLocationSource(fix: nil))
        XCTAssertTrue(noFix.canOpen)
        await noFix.openWindow(label: "Regroup", place: "", radiusMeters: 200, minutes: 30, groups: [])
        XCTAssertEqual(noFix.error, "Could not read this phone's position. Stand at the meeting point and allow location.")
        let here = MeetingWindowModel(api: unreachableClient(), trip: leader, locationSource: FakeLocationSource(fix: LocationFix(lat: 41.89, lng: 12.49, accuracyMeters: 8)))
        await here.openWindow(label: "Regroup", place: "", radiusMeters: 200, minutes: 30, groups: ["Bus A"])
        XCTAssertEqual(here.error, "Offline. A window needs one connection to open.")
        XCTAssertNil(here.window)
        let traveler = ActiveTrip(organizationId: "org1", organizationName: "Seoul Arts High", tripId: "trip1", tripName: "Korea Concert Tour", participationId: "p-minji", role: "traveler")
        XCTAssertFalse(MeetingWindowModel(api: unreachableClient(), trip: traveler).canOpen)
    }

    func testMeetingWindowSampleModeFlipsTheFixtureAndNeverSyncs() async {
        let model = MeetingWindowModel()
        XCTAssertFalse(model.live)
        XCTAssertEqual(model.window?.me?.state, WindowState.optedOut)
        model.setSharing(true)
        XCTAssertEqual(model.window?.me?.state, WindowState.uncertain)
        await model.refresh()
        XCTAssertNil(model.error)
        XCTAssertNil(MeetingWindowModel(window: nil).window)
    }

    func testSessionWipeNoticeFromTheStore() async {
        // Slice 031 (D28): a store carrying the revoked notice shows it; a wipe mid-session signs out.
        let store = InMemorySecureStore()
        store.put(key: SessionManager.companion.KEY_REVOKED_NOTICE, value: "1")
        let client = unreachableClient()
        let model = SessionModel(api: client, manager: SessionManager(api: client, store: store))
        XCTAssertTrue(model.revokedNotice)
        XCTAssertTrue(model.session is SessionStateSignedOut)
        store.put(key: SessionManager.companion.KEY_REVOKED_NOTICE, value: nil)
        store.put(key: SessionManager.companion.KEY_TOKEN, value: "tok")
        store.put(key: "session.accountId", value: "acc")
        model.refresh()
        XCTAssertFalse(model.revokedNotice)
        XCTAssertTrue(model.session is SessionStateNeedsInvite)
        client.onWipe?()
        try? await Task.sleep(for: .milliseconds(50))
        XCTAssertTrue(model.session is SessionStateSignedOut)
        XCTAssertTrue(model.revokedNotice)
    }

    func testChatsSampleModeAndUnreachable() async {
        // Slice 033 (D22): sample mode lists the fixture, opens Minji's thread and shows a send as
        // pending without the network; live and unreachable says so and keeps a send as failed.
        let sample = ChatsModel(deviceClock: { "06:45" }, newId: { "local-1" }, senderName: "Minji Park")
        XCTAssertFalse(sample.live)
        XCTAssertEqual(sample.channels.map { $0.id }, ["trip", "group:Bus A", "traveler:t1"])
        XCTAssertEqual(sample.unreadTotal, 4)
        await sample.openChannel("traveler:t1")
        XCTAssertEqual(sample.open?.messages.count, 4)
        await sample.send("On my way")
        XCTAssertEqual(sample.open?.messages.count, 5)
        XCTAssertEqual(sample.open?.messages.last?.pending, true)
        sample.close()
        XCTAssertNil(sample.open)
        let live = ChatsModel(api: unreachableClient(), trip: trip)
        XCTAssertTrue(live.live)
        await live.refresh()
        XCTAssertEqual(live.error, "Offline. Showing what was last loaded.")
        XCTAssertEqual(live.channels.count, 0)
    }

    func testPlanLiveStartsEmptyAndGoesOfflineWhenUnreachable() async {
        // Slice 035: live starts without days (no fixture); unreachable marks offline and says so on a send.
        let model = PlanModel(api: unreachableClient(), trip: trip)
        XCTAssertTrue(model.live)
        XCTAssertTrue(model.canPropose)
        XCTAssertTrue(model.canSeeTravel)
        XCTAssertNil(model.travel)
        XCTAssertEqual(model.plan.days.count, 0)
        XCTAssertEqual(model.plan.revisionLine(), "Not published yet")
        await model.refresh()
        XCTAssertTrue(model.plan.offline)
        XCTAssertFalse(model.syncing)
        // Slice 047: the bookings never loaded, so the section stays hidden rather than empty.
        XCTAssertNil(model.travel)
        await model.propose(ProposalDraft(kind: .remove, eventId: "e1", note: "Why", start: nil, end: nil, title: nil, place: nil, date: nil, timeZone: nil, order: 0))
        XCTAssertEqual(model.proposal?.error, "Offline. Try again when connected.")
        XCTAssertEqual(model.proposal?.kind, ProposalKind.remove)
        // An incomplete draft never reaches the network.
        await model.propose(ProposalDraft(kind: .add, eventId: nil, note: "Why", start: "", end: nil, title: "Gelato", place: nil, date: "2026-12-31", timeZone: "Europe/Rome", order: 8))
        XCTAssertEqual(model.proposal?.error, "The start must be HH:mm.")
        let traveler = ActiveTrip(organizationId: "org1", organizationName: "Seoul Arts High", tripId: "trip1", tripName: "Korea Concert Tour", participationId: "p-minji", role: "traveler")
        XCTAssertFalse(PlanModel(api: unreachableClient(), trip: traveler).canPropose)
        XCTAssertFalse(PlanModel(api: unreachableClient(), trip: traveler).canSeeTravel)
    }

    func testPlanSampleModeOpensTheConcertDayAndSendsNothing() async {
        let model = PlanModel()
        XCTAssertFalse(model.live)
        XCTAssertEqual(model.plan.days.count, 4)
        XCTAssertEqual(model.selected, 3)
        XCTAssertEqual(model.plan.days[3].label, "Concert day")
        // Slice 047: the fixture bookings, read off per day through core.
        XCTAssertEqual(model.travel?.buses.count, 2)
        let concert = model.travel?.bookingsOn(date: "2026-12-31")
        XCTAssertEqual(concert?.flights.count, 0)
        XCTAssertEqual(concert?.hotels.first?.detail(), "Night 4 of 5 · Rome · 21 rooms")
        XCTAssertEqual(model.travel?.bookingsOn(date: "2026-12-28").flights.first?.detail(), "DEMO 901 · 13:30 → 18:55 · PNR VYS8K2 · 42 seats")
        await model.refresh()
        XCTAssertFalse(model.plan.offline)
        await model.propose(ProposalDraft(kind: .remove, eventId: "ev_5", note: "Rained out", start: nil, end: nil, title: nil, place: nil, date: nil, timeZone: nil, order: 0))
        XCTAssertEqual(model.proposal?.sent, true)
        model.dismissProposal()
        XCTAssertNil(model.proposal)
    }

    func testTodayProposeSampleAndUnreachable() async {
        // Slice 035: iOS proposes from the up-next card like Android (slice 018).
        let sample = TodayModel()
        XCTAssertTrue(sample.canPropose)
        await sample.propose(ProposalDraft(kind: .edit, eventId: "ev_2", note: "Why", start: "07:00", end: nil, title: nil, place: nil, date: nil, timeZone: nil, order: 0))
        XCTAssertEqual(sample.proposal?.sent, true)
        let live = TodayModel(api: unreachableClient(), trip: trip)
        await live.propose(ProposalDraft(kind: .edit, eventId: "e1", note: "Why", start: "07:00", end: nil, title: nil, place: nil, date: nil, timeZone: nil, order: 0))
        XCTAssertEqual(live.proposal?.error, "Offline. Try again when connected.")
        let guardian = ActiveTrip(organizationId: "org1", organizationName: "Seoul Arts High", tripId: "trip1", tripName: "Korea Concert Tour", participationId: "p-sora", role: "guardian")
        XCTAssertFalse(TodayModel(api: unreachableClient(), trip: guardian).canPropose)
    }

    func testPackingSampleAndUnreachable() async {
        // Slice 048 (D38): sample mode ticks the fixture without the network; live and unreachable is honest.
        let sample = PackingModel()
        XCTAssertFalse(sample.live)
        XCTAssertEqual(sample.list.summary(), "6 of 9 packed")
        XCTAssertEqual(sample.list.whose(), "Your packing list")
        await sample.setPacked("pk7", true)
        XCTAssertEqual(sample.list.summary(), "7 of 9 packed")
        XCTAssertNil(sample.notice)
        let live = PackingModel(api: unreachableClient(), trip: trip)
        XCTAssertTrue(live.live)
        XCTAssertEqual(live.list.items.count, 0)
        await live.refresh()
        XCTAssertTrue(live.list.offline)
        XCTAssertEqual(live.error, "Offline. Showing the last list.")
        await live.setPacked("x", true)
        XCTAssertEqual(live.notice, "Offline. The tick will not reach the organizer until you are connected; try again then.")
    }

    func testInboxSampleAndUnreachable() async {
        // Slice 053 (D29): sample mode reads the fixture without the network; live and unreachable is honest.
        let sample = InboxModel()
        XCTAssertFalse(sample.live)
        XCTAssertEqual(sample.inbox.summary(), "2 unread")
        XCTAssertEqual(sample.inbox.items.first?.meta(), "Priority · Head count · 06:52")
        await sample.markRead("nt1")
        XCTAssertEqual(sample.inbox.summary(), "1 unread")
        XCTAssertNil(sample.notice)
        XCTAssertEqual(InboxModelKt.bellSpoken(unread: 1), "Inbox, 1 unread")
        let live = InboxModel(api: unreachableClient(), trip: trip)
        XCTAssertTrue(live.live)
        XCTAssertEqual(live.inbox.items.count, 0)
        await live.refresh()
        XCTAssertTrue(live.inbox.offline)
        XCTAssertEqual(live.error, "Offline. Showing the last inbox.")
        // The row labels: today's time alone, a date before.
        let today = Date()
        let iso = ISO8601DateFormatter().string(from: today)
        XCTAssertEqual(Clocks.localDayTime(iso, now: today).count, 5)
        XCTAssertEqual(Clocks.localDayTime("2026-12-30T20:05:00.000Z", now: today).count, 11)
        XCTAssertEqual(Clocks.localDayTime("nope"), "nope")
    }

    func testRoomingSampleAndUnreachable() async {
        // Slice 059 (D41): sample mode reads the fixture rooms; live and unreachable is offline and honest.
        let sample = RoomingModel()
        XCTAssertFalse(sample.live)
        XCTAssertEqual(sample.rooming.byRoom().map { $0.room }, ["412", "415", "501"])
        XCTAssertEqual(sample.rooming.summary(), "4 of 5 placed · 3 of 21 rooms used")
        XCTAssertEqual(sample.rooming.unassigned(), ["Lee Hana"])
        let live = RoomingModel(api: unreachableClient(), trip: trip, bookingId: "h1", hotelName: "Hotel de la Ville")
        XCTAssertTrue(live.live)
        XCTAssertEqual(live.rooming.hotelName, "Hotel de la Ville")
        XCTAssertEqual(live.rooming.people.count, 0)
        await live.refresh()
        XCTAssertTrue(live.rooming.offline)
        XCTAssertEqual(live.error, "Offline. Showing the last list.")
    }

    func testMemoriesSampleAndUnreachable() async {
        // Slice 044 (D18): sample mode is the leader's view of the fixture; a guardian sees the album only.
        let sample = MemoriesModel()
        XCTAssertFalse(sample.live)
        XCTAssertEqual(sample.queue.count, 1)
        XCTAssertEqual(sample.pool.count, 5)
        XCTAssertTrue(sample.canReview)
        XCTAssertTrue(sample.canUpload)
        let guardian = MemoriesModel(sampleRole: "guardian")
        XCTAssertFalse(guardian.canUpload)
        XCTAssertEqual(guardian.album.count, 2)
        XCTAssertEqual(guardian.summary, "2 approved photos of your traveler")
        await sample.upload([(original: Data([1, 2, 3]), thumbnail: nil)])
        XCTAssertEqual(sample.notice, "1 uploaded.")
        // Live and unreachable: empty, honest, offline.
        let live = MemoriesModel(api: unreachableClient(), trip: trip)
        XCTAssertTrue(live.live)
        XCTAssertEqual(live.pool.count, 0)
        await live.refresh()
        XCTAssertTrue(live.feed.offline)
        XCTAssertEqual(live.error, "Offline. Showing the last photos.")
        await live.upload([(original: Data([1, 2, 3]), thumbnail: Data([4]))])
        XCTAssertEqual(live.notice, "Offline. The photo stays on your phone; try again with a connection.")
    }

    func testClocksFormatWireTimes() {
        XCTAssertEqual(Clocks.localTime("not a date"), "not a date")
        let hhmm = Clocks.localTime("2026-12-31T06:30:00.000Z")
        XCTAssertEqual(hhmm.count, 5)
        XCTAssertEqual(hhmm.dropFirst(2).first, ":")
        XCTAssertEqual(Clocks.date(in: "Europe/Rome").count, 10)
        XCTAssertEqual(Clocks.time(in: "Asia/Seoul").count, 5)
    }
}

/// A location source for tests: the fix it was given, never the hardware.
private struct FakeLocationSource: DeviceLocationSource {
    let stored: LocationFix?
    init(fix: LocationFix?) { stored = fix }
    func fix() async -> LocationFix? { stored }
}
