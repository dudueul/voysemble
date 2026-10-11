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
        XCTAssertFalse(model.window.selfOptedIn)
        XCTAssertEqual(model.window.minutesLeftAt(now: "10:52"), 28)
        model.setSharing(true)
        XCTAssertTrue(model.window.selfOptedIn)
        XCTAssertEqual(model.window.count(state: WindowState.uncertain), 2)
        model.setSharing(false)
        XCTAssertEqual(model.window.me?.state, WindowState.optedOut)
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
