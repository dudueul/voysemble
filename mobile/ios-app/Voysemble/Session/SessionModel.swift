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

    let api: ApiClient
    private let manager: SessionManager

    init(api: ApiClient? = nil, manager: SessionManager? = nil) {
        let store = KeychainSecureStore()
        let client = api ?? ApiClient(
            config: ApiClientConfig(host: AppConfig.apiHost, userAgent: "Voysemble-iOS", sessionToken: { store.get(key: SessionManager.companion.KEY_TOKEN) }),
            engine: DarwinEngineFactory.shared.create(),
        )
        self.api = client
        self.manager = manager ?? SessionManager(api: client, store: store)
        self.session = self.manager.current()
    }

    func requestLink(_ email: String) async {
        await run { try await self.manager.requestLink(email: email, locale: "ko") }
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
        busy = false
    }
}
