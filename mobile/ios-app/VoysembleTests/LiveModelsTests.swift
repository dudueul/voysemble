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
