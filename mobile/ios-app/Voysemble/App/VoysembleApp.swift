// Copyright 2026- At Day. All rights reserved.
// App entry. The session decides the root: sign-in, join a trip, or the app (slice 011).
// Sample mode shows the fixture app without an account.

import SwiftUI
import VoysembleCore

@main
struct VoysembleApp: App {
    @StateObject private var session = SessionModel()

    var body: some Scene {
        WindowGroup {
            RootView(session: session)
        }
    }
}

struct RootView: View {
    @ObservedObject var session: SessionModel

    var body: some View {
        if session.session is SessionStateReady || session.sampleMode {
            TodayView(model: TodayModel())
        } else if session.session is SessionStateNeedsInvite {
            InviteView(model: session)
        } else {
            SignInView(model: session)
        }
    }
}
