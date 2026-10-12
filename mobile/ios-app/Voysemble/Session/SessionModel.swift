// Copyright 2026- At Day. All rights reserved.
// Observable wrapper over the core SessionManager (SKIE exposes its suspend functions as async).
// Mirrors SessionViewModel on Android: safe messages, sample mode, state refreshed after calls.

import Foundation
import VoysembleCore

@MainActor
final class SessionModel: ObservableObject {
    @Published private(set) var session: SessionState
    @Published var sampleMode = false
    @Published private(set) var busy = false
    @Published private(set) var error: String?
    /// D28: the organizer revoked this phone; the sign-in screen says so until the next attempt.
    @Published private(set) var revokedNotice = false
    /// Slice 067: the account's trips for the Today header's switch; nil until asked.
    @Published private(set) var tripChoices: [TripChoice]?
    @Published private(set) var tripChoicesError: String?

    let api: ApiClient
    private let manager: SessionManager

    init(api: ApiClient? = nil, manager: SessionManager? = nil) {
        let store = KeychainSecureStore()
        let client = api ?? ApiClient(
            config: ApiClientConfig(host: AppConfig.apiHost, userAgent: "Voysemble-iOS", sessionToken: { store.get(key: SessionManager.companion.KEY_TOKEN) }),
            engine: DarwinEngineFactory.shared.create(),
        )
        self.api = client
        let m = manager ?? SessionManager(api: client, store: store)
        self.manager = m
        self.session = m.current()
        self.revokedNotice = m.revokedNotice()
        // Lost or stolen device (D28): a wiped answer clears the session mid-call and the route
        // changes at once; the hooks run on the client's thread, so hop to the main actor.
        client.onWipe = { m.wipe() }
        m.onWiped = { [weak self] in Task { @MainActor in self?.refresh() } }
    }

    /// Re-read the store (after a wipe from any screen's call).
    func refresh() {
        session = manager.current()
        revokedNotice = manager.revokedNotice()
        if session is SessionStateSignedOut { sampleMode = false }
    }

    func requestLink(_ email: String) async {
        await run { try await self.manager.requestLink(email: email, locale: "ko") }
    }

    /** A magic link that opened the app: only /auth/verify links verify; anything else is ignored. */
    func openMagicLink(_ url: URL) async {
        guard url.scheme == "https", url.path == "/auth/verify", (url.fragment ?? "").contains("token=") else { return }
        if session is SessionStateReady { return }
        await verify(url.absoluteString)
    }

    func verify(_ linkOrToken: String) async {
        await run { try await self.manager.verify(linkOrToken: linkOrToken) }
    }

    func redeem(_ code: String) async {
        await run { try await self.manager.redeem(code: code) }
    }

    /// Slice 067: every trip this account is on, for the switch.
    func loadTripChoices() async {
        do {
            let r = try await manager.tripChoices()
            if let ok = (r as? ApiResultOk<TripChoices>)?.value {
                tripChoices = ok.choices
                tripChoicesError = nil
            } else if let failed = r as? ApiResultFailed {
                tripChoicesError = tr1(.tripSwitchFailed, failed.error.code)
            } else {
                tripChoicesError = tr(.authUnreachable)
            }
        } catch {
            tripChoicesError = tr(.authUnreachable)
        }
    }

    /// Make another trip the active one; the root re-keys on the trip and every screen rebinds.
    func switchTrip(_ choice: TripChoice) {
        manager.switchTo(choice: choice)
        session = manager.current()
    }

    func signOut() async {
        busy = true
        try? await manager.signOut()
        session = manager.current()
        revokedNotice = manager.revokedNotice()
        busy = false
    }

    private func run(_ block: @escaping () async throws -> Any) async {
        busy = true
        error = nil
        do {
            let result = try await block()
            if let failed = result as? ApiResultFailed {
                error = tr2(.authRef, failed.error.message, failed.error.correlationId)
            } else if let unreachable = result as? ApiResultUnreachable {
                error = unreachable.reason == "no-token" ? tr(.authPasteWhole) : tr(.authUnreachable)
            }
        } catch {
            self.error = tr(.authSomethingWrong)
        }
        session = manager.current()
        revokedNotice = manager.revokedNotice()
        busy = false
    }
}
