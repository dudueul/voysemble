// Copyright 2026- At Day. All rights reserved.
// Facts proven through the Kotlin framework from Swift: head count toggle/close and meeting
// window opt-in behave exactly as the JVM tests say. This is the interop gate for slice 009.

import XCTest
import VoysembleCore
@testable import Voysemble

@MainActor
final class CoreModelsTests: XCTestCase {
    func testHeadcountToggleAndCloseFromSwift() {
        let model = HeadcountModel(deviceClock: { "06:58" })
        XCTAssertEqual(model.session.presentCount, 18)
        XCTAssertEqual(model.session.missing.map(\.name), ["Dohyun Kang", "Eunwoo Shin"])
        model.toggle("t7")
        XCTAssertEqual(model.session.presentCount, 19)
        XCTAssertEqual(model.session.syncState, SyncState.pending)
        model.close()
        XCTAssertTrue(model.session.isClosed)
        XCTAssertEqual(model.session.closedAtDevice, "06:58")
        XCTAssertEqual(model.session.markOf(memberId: "t5"), HeadcountMark.missing)
    }

    func testMeetingWindowOptInFromSwift() {
        let model = MeetingWindowModel(now: "10:52")
        XCTAssertEqual(model.window?.selfOptedIn, false)
        XCTAssertEqual(model.window?.minutesLeftAt(now: "10:52"), 28)
        model.setSharing(true)
        XCTAssertEqual(model.window?.selfOptedIn, true)
        XCTAssertEqual(model.window?.count(state: WindowState.uncertain), 2)
        model.setSharing(false)
        XCTAssertEqual(model.window?.me?.state, WindowState.optedOut)
    }

    func testWindowJudgementFromSwift() {
        // Slice 029: the device rule and the wire names reachable from Swift (top-level, no enum extensions).
        XCTAssertEqual(WindowRulesKt.judgeWindowState(distanceMeters: KotlinDouble(double: 50), accuracyMeters: 20, radiusMeters: 200), "inside")
        XCTAssertEqual(WindowRulesKt.judgeWindowState(distanceMeters: KotlinDouble(double: 250), accuracyMeters: 20, radiusMeters: 200), "outside")
        XCTAssertEqual(WindowRulesKt.judgeWindowState(distanceMeters: nil, accuracyMeters: 20, radiusMeters: 200), "uncertain")
        XCTAssertEqual(WindowRulesKt.wireNameOf(state: WindowState.optedOut), "opted_out")
        XCTAssertEqual(WindowRulesKt.windowStateOf(wire: "stale"), WindowState.stale)
        let fixture = KoreaConcertTourFixture.shared.meetingWindow()
        XCTAssertEqual(fixture.withSelfState(state: WindowState.inside).me?.state, WindowState.inside)
    }

    func testBulletinAcknowledgeQueuesOnce() {
        let model = BulletinModel()
        XCTAssertEqual(model.feed.unackedRequired.count, 1)
        model.acknowledge("an_departure")
        model.acknowledge("an_departure")
        XCTAssertEqual(model.feed.outbox.count, 1)
        XCTAssertEqual(model.feed.unackedRequired.count, 0)
    }
}
