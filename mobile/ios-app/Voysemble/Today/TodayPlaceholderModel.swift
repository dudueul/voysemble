// Copyright 2026- At Day. All rights reserved.
// Slice 002 placeholder: proves VoysembleCore (Kotlin) -> API round trip from SwiftUI.
// Replaced by the real Today screen in P1. Mirrors HealthUiState on Android.

import Foundation
import VoysembleCore

enum HealthUiState: Equatable {
    case idle
    case loading
    case reachable(envName: String, buildId: String)
    case serverError(code: String, correlationId: String)
    case offline(reason: String)
}

@MainActor
final class TodayPlaceholderModel: ObservableObject {
    @Published private(set) var state: HealthUiState = .idle
    private let client: ApiClient

    init(host: String) {
        let config = ApiClientConfig(host: host, userAgent: PlatformKt.defaultUserAgent())
        client = ApiClient(config: config, engine: DarwinEngineFactory.shared.create())
    }

    func checkHealth() {
        state = .loading
        Task {
            do {
                let result = try await client.health(correlationId: nil)
                switch onEnum(of: result) {
                case .ok(let ok):
                    state = .reachable(envName: ok.value.envName, buildId: ok.value.buildId)
                case .failed(let failed):
                    state = .serverError(code: failed.error.code, correlationId: failed.error.correlationId)
                case .unreachable(let u):
                    state = .offline(reason: u.reason)
                }
            } catch {
                state = .offline(reason: "bridge:\(error.localizedDescription)")
            }
        }
    }
}
