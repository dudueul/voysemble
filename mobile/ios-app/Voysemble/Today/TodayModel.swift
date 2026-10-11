// Copyright 2026- At Day. All rights reserved.
// Today screen state holder (SwiftUI). Mirrors TodayViewModel on Android; rules live in core.

import Foundation
import VoysembleCore

enum MainTab: CaseIterable { case today, plan, bulletin, chats, memories }

@MainActor
final class TodayModel: ObservableObject {
    @Published private(set) var snapshot: TodaySnapshot
    @Published var tab: MainTab = .today

    init(snapshot: TodaySnapshot = KoreaConcertTourFixture.shared.today()) {
        self.snapshot = snapshot
    }

    func acknowledge(_ id: String) {
        snapshot = snapshot.acknowledgeAnnouncement(id: id)
    }
}
