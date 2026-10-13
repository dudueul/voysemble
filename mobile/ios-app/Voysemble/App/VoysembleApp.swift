// Copyright 2026- At Day. All rights reserved.
// App entry. The session decides the root: sign-in, join a trip, or the app (slice 011).
// Sample mode shows the fixture app without an account.

import SwiftUI
import VoysembleCore

@main
struct VoysembleApp: App {
    @StateObject private var session = SessionModel()

    init() {
        // Slice 039: the phone's language decides the app's (Korean or English), once per launch.
        AppLocale.shared.set(languageTag: Locale.preferredLanguages.first ?? "en")
    }

    var body: some Scene {
        WindowGroup {
            RootView(session: session)
                // Universal Links (slice 019): the magic link opens the app and verifies itself.
                .onOpenURL { url in Task { await session.openMagicLink(url) } }
                .onContinueUserActivity(NSUserActivityTypeBrowsingWeb) { activity in
                    if let url = activity.webpageURL { Task { await session.openMagicLink(url) } }
                }
        }
    }
}

struct RootView: View {
    @ObservedObject var session: SessionModel

    var body: some View {
        if let ready = session.session as? SessionStateReady {
            // Live app: every screen reads the API for the active trip (slice 024).
            // Slice 067: keyed by the trip so a switch rebuilds every screen for the new one.
            TodayView(model: TodayModel(api: session.api, trip: ready.trip, pack: OfflinePack(store: KeychainSecureStore())), session: session)
                .id(ready.trip.tripId)
        } else if session.sampleMode {
            TodayView(model: TodayModel())
        } else if session.session is SessionStateNeedsInvite {
            InviteView(model: session)
        } else {
            SignInView(model: session)
        }
    }
}
