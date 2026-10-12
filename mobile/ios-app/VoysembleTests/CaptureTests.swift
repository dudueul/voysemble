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
    }

    func testHeadcountOpenAndClosed() throws {
        try capture(NavigationStack { HeadcountView(model: HeadcountModel()) }, name: "headcount-open")
        let closed = HeadcountModel(deviceClock: { "06:58" })
        closed.close()
        try capture(NavigationStack { HeadcountView(model: closed) }, name: "headcount-closed-dark", scheme: .dark)
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
    }

    func testSignInAndInvite() throws {
        try capture(SignInView(model: SessionModel()), name: "sign-in")
        try capture(InviteView(model: SessionModel()), name: "invite")
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
