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

    func testIncidentsLiveMarksOfflineWhenUnreachable() async {
        let model = IncidentsModel(api: unreachableClient(), trip: trip)
        XCTAssertTrue(model.live)
        await model.refresh()
        XCTAssertTrue(model.feed.offline)
        XCTAssertNil(model.error)
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
