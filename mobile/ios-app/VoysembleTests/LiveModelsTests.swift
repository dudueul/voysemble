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
