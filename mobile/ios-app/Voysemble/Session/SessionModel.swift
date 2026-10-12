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
                error = "\(failed.error.message) (ref \(failed.error.correlationId))"
            } else if let unreachable = result as? ApiResultUnreachable {
                error = unreachable.reason == "no-token" ? "Paste the whole link from the email." : "Could not reach the server. Check your connection."
            }
        } catch {
            self.error = "Something went wrong."
        }
        session = manager.current()
        revokedNotice = manager.revokedNotice()
        busy = false
    }
}
