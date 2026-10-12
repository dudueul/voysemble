// Copyright 2026- At Day. All rights reserved.
//
// Visual evidence for the iOS screens (D31, doc 01 §18.4): every screen state renders inside a
// real UIWindow on the simulator and is written as a PNG under docs/captures/ios/. The views are
// hosted in UIHostingController (not ImageRenderer) so List, NavigationStack and TabView draw as
// they do on a device. 393x852 points (iPhone 15/16 class) at 2x. CI uploads the folder as the
// `ios-captures` artifact and the `captures` job commits it back to the branch.
//
// Output directory: $VOYSEMBLE_CAPTURES_DIR when set (xcodebuild passes TEST_RUNNER_-prefixed
// variables to the test process), else <repo>/docs/captures/ios derived from this file's path.

import SwiftUI
import UIKit
import VoysembleCore
import XCTest
@testable import Voysemble

@MainActor
final class CaptureTests: XCTestCase {
    private static let size = CGSize(width: 393, height: 852)

    func testTodayLightAndDark() throws {
        try capture(TodayView(model: TodayModel()), name: "today-light")
        try capture(TodayView(model: TodayModel()), name: "today-dark", scheme: .dark)
    }

    func testTodayGuardian() throws {
        // D13: the guardian's card in place of the head count and leader links.
        try capture(TodayView(model: TodayModel(guardian: KoreaConcertTourFixture.shared.guardianCard(locale: "en"))), name: "today-guardian")
        // Slice 032 (D27): the guardian's care-note card in edit mode, prefilled from a reveal.
        let status = CareNoteStatusDto(participationId: "t1", hasCareNote: true, updatedAt: "2026-12-30T10:00:00.000Z", updatedByName: "Sora Park", reveals: 2)
        let editing = TodayModel(
            guardian: KoreaConcertTourFixture.shared.guardianCard(locale: "en"),
            careStatus: status,
            careDraft: KoreaConcertTourFixture.shared.careNote(),
        )
        try capture(TodayView(model: editing), name: "today-guardian-care")
    }

    func testHeadcountOpenAndClosed() throws {
        try capture(NavigationStack { HeadcountView(model: HeadcountModel()) }, name: "headcount-open")
        let closed = HeadcountModel(deviceClock: { "06:58" })
        closed.close()
        try capture(NavigationStack { HeadcountView(model: closed) }, name: "headcount-closed-dark", scheme: .dark)
        // Slice 030 (D27): Minji's care note revealed in the roster row.
        let care = HeadcountModel()
        care.revealCare("t1")
        try capture(NavigationStack { HeadcountView(model: care) }, name: "headcount-care")
    }

    func testBulletinWithRevision() throws {
        try capture(NavigationStack { BulletinView(model: BulletinModel()) }, name: "bulletin-light")
    }

    func testIncidents() throws {
        try capture(NavigationStack { IncidentsView(model: IncidentsModel()) }, name: "incidents-light")
    }

    func testMeetingWindow() throws {
        try capture(NavigationStack { MeetingWindowView(model: MeetingWindowModel()) }, name: "window-open")
        // Slice 029: the switch on (sample mode flips the fixture) and a trip without a window.
        let sharing = MeetingWindowModel()
        sharing.setSharing(true)
        try capture(NavigationStack { MeetingWindowView(model: sharing) }, name: "window-sharing-dark", scheme: .dark)
        try capture(NavigationStack { MeetingWindowView(model: MeetingWindowModel(window: nil)) }, name: "window-none")
        // Slice 032: a leader without a window sees the form to open one here.
        try capture(NavigationStack { MeetingWindowView(model: MeetingWindowModel(window: nil, canOpen: true)) }, name: "window-open-form")
    }

    func testChats() async throws {
        // Slice 033 (D22): the channel list and Minji's thread with a pending message.
        try capture(NavigationStack { ChatsView(model: ChatsModel()) }, name: "chats-list")
        let thread = ChatsModel(deviceClock: { "06:45" }, newId: { "local-1" }, senderName: "Minji Park")
        await thread.openChannel("traveler:t1")
        await thread.send("On my way!")
        try capture(NavigationStack { ChatsView(model: thread) }, name: "chats-thread-dark", scheme: .dark)
    }

    func testMemories() throws {
        // Slice 044 (D18): the leader's view of the fixture pool with the review queue, and a guardian's album.
        try capture(NavigationStack { MemoriesView(model: MemoriesModel()) }, name: "memories-light")
        try capture(NavigationStack { MemoriesView(model: MemoriesModel(sampleRole: "guardian")) }, name: "memories-guardian-dark", scheme: .dark)
    }

    func testPacking() throws {
        // Slice 048 (D38): a traveler's packing list with six of nine packed; a guardian's list for their traveler, dark.
        try capture(NavigationStack { PackingView(model: PackingModel()) }, name: "packing-light")
        let fixture = KoreaConcertTourFixture.shared.packing()
        let mine = PackingList(items: fixture.items, travelerName: "Minji Park", forTraveler: true, offline: false)
        try capture(NavigationStack { PackingView(model: PackingModel(list: mine)) }, name: "packing-guardian-dark", scheme: .dark)
    }

    func testInbox() throws {
        // Slice 053 (D29): a leader's inbox on the concert morning with two unread; the same, all read, dark.
        try capture(NavigationStack { InboxView(model: InboxModel(), onOpen: { _ in }) }, name: "inbox-light")
        let read = KoreaConcertTourFixture.shared.inbox().withRead(id: "nt1").withRead(id: "nt2")
        try capture(NavigationStack { InboxView(model: InboxModel(inbox: read)) }, name: "inbox-all-read-dark", scheme: .dark)
    }

    func testRooming() throws {
        // Slice 059 (D41): the fixture hotel's rooms, the leader in bold, one person without a room; light and dark.
        try capture(NavigationStack { RoomingView(model: RoomingModel()) }, name: "rooming-light")
        try capture(NavigationStack { RoomingView(model: RoomingModel()) }, name: "rooming-dark", scheme: .dark)
    }

    func testPlan() throws {
        // Slice 035: the fixture plan on its concert day with the leader's affordances; slice 047 adds
        // the day's bookings under the events (the hotel night here, the flight and the check-in on arrival).
        try capture(NavigationStack { PlanView(model: PlanModel()) }, name: "plan-day")
        let arrival = PlanModel()
        arrival.selected = 0
        try capture(NavigationStack { PlanView(model: arrival) }, name: "plan-arrival")
        // The proposal form for a new event, filled as a leader would.
        let day = KoreaConcertTourFixture.shared.plan().days[3]
        let form = ProposeChangeForm(
            target: ProposalTarget.forDay(day),
            prefill: ProposalPrefill(title: "Gelato on the way back", start: "16:15", note: "The group asked; it is on the walk."),
            onSend: { _ in }, onCancel: {},
        )
        try capture(NavigationStack { ScrollView { form.padding(20) } }, name: "plan-propose-dark", scheme: .dark)
    }

    func testKorean() throws {
        // Slice 039: the same screens in Korean; the fixture's own names stay as they are.
        AppLocale.shared.current = "ko"
        defer { AppLocale.shared.current = "en" }
        try capture(TodayView(model: TodayModel()), name: "today-ko")
        try capture(NavigationStack { PlanView(model: PlanModel()) }, name: "plan-day-ko")
    }

    func testSignInAndInvite() throws {
        try capture(SignInView(model: SessionModel()), name: "sign-in")
        try capture(InviteView(model: SessionModel()), name: "invite")
        // Slice 031 (D28): the sign-in screen after the organizer revoked this phone.
        let store = InMemorySecureStore()
        store.put(key: SessionManager.companion.KEY_REVOKED_NOTICE, value: "1")
        let client = ApiClient(
            config: ApiClientConfig(host: "127.0.0.1:9", userAgent: "Voysemble-iOS-tests", sessionToken: { nil }),
            engine: DarwinEngineFactory.shared.create(),
        )
        try capture(SignInView(model: SessionModel(api: client, manager: SessionManager(api: client, store: store))), name: "sign-in-revoked")
    }

    // MARK: - Harness

    private func capture<V: View>(_ view: V, name: String, scheme: ColorScheme = .light) throws {
        let host = UIHostingController(rootView: view.environment(\.colorScheme, scheme))
        // A window attached to the test host's scene renders through the screen like the app's own.
        let window: UIWindow
        if let scene = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }).first {
            window = UIWindow(windowScene: scene)
            window.frame = CGRect(origin: .zero, size: Self.size)
        } else {
            window = UIWindow(frame: CGRect(origin: .zero, size: Self.size))
        }
        window.overrideUserInterfaceStyle = scheme == .dark ? .dark : .light
        window.rootViewController = host
        window.makeKeyAndVisible()
        host.view.frame = window.bounds
        host.view.layoutIfNeeded()
        // Let SwiftUI publish state and lay out lists before drawing.
        RunLoop.current.run(until: Date().addingTimeInterval(0.3))
        let format = UIGraphicsImageRendererFormat()
        format.scale = 2
        let image = UIGraphicsImageRenderer(bounds: window.bounds, format: format).image { _ in
            window.drawHierarchy(in: window.bounds, afterScreenUpdates: true)
        }
        guard let png = image.pngData() else { return XCTFail("no png for \(name)") }
        let dir = try Self.outputDirectory()
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let url = dir.appendingPathComponent("\(name).png")
        try png.write(to: url)
        XCTAssertGreaterThan(png.count, 10_000, "\(name) looks empty")
        window.isHidden = true
    }

    private static func outputDirectory() throws -> URL {
        if let env = ProcessInfo.processInfo.environment["VOYSEMBLE_CAPTURES_DIR"], !env.isEmpty {
            return URL(fileURLWithPath: env, isDirectory: true)
        }
        // <repo>/mobile/ios-app/VoysembleTests/CaptureTests.swift -> <repo>/docs/captures/ios
        let file = URL(fileURLWithPath: #filePath)
        let repo = file.deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        return repo.appendingPathComponent("docs/captures/ios", isDirectory: true)
    }
}
