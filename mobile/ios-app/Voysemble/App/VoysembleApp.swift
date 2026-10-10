// Copyright 2026- At Day. All rights reserved.
// App entry. Real navigation arrives in P1/P2 slices.

import SwiftUI

@main
struct VoysembleApp: App {
    var body: some Scene {
        WindowGroup {
            TodayPlaceholderView(model: TodayPlaceholderModel(host: AppConfig.apiHost))
        }
    }
}
