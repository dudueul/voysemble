// Copyright 2026- At Day. All rights reserved.
// Placeholder screen for slice 002. Non-color status cues (symbols + text).

import SwiftUI

struct TodayPlaceholderView: View {
    @StateObject var model: TodayPlaceholderModel

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Voysemble").font(.largeTitle.bold())
            Text("Today (placeholder, slice 002)")
            Button("Check backend") { model.checkHealth() }
                .buttonStyle(.borderedProminent)
                .tint(Color(argb: Tokens.Color.Light.action))
            Text(statusText).font(.body)
            Spacer()
        }
        .padding(24)
    }

    private var statusText: String {
        switch model.state {
        case .idle: return "Not checked yet"
        case .loading: return "Checking…"
        case .reachable(let env, let build): return "✓ Reachable: \(env) build \(build)"
        case .serverError(let code, let corr): return "✗ Server error \(code) (ref \(corr))"
        case .offline(let reason): return "⚠ Offline: \(reason)"
        }
    }
}

extension Color {
    /// ARGB literal from generated design tokens.
    init(argb: UInt32) {
        let a = Double((argb >> 24) & 0xFF) / 255
        let r = Double((argb >> 16) & 0xFF) / 255
        let g = Double((argb >> 8) & 0xFF) / 255
        let b = Double(argb & 0xFF) / 255
        self.init(.sRGB, red: r, green: g, blue: b, opacity: a)
    }
}
