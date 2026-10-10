// Copyright 2026- At Day. All rights reserved.
// App entry. Today is the first real screen; other tabs are honest placeholders.

import SwiftUI

@main
struct VoysembleApp: App {
    var body: some Scene {
        WindowGroup {
            TodayView(model: TodayModel())
        }
    }
}
