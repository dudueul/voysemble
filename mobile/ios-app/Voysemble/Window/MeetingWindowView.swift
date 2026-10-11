// Copyright 2026- At Day. All rights reserved.
// Meeting window (atlas #7, D15). Schematic zone drawn with Canvas; no map tiles, no coordinates.
// Mirrors MeetingWindowScreen on Android. Unverified on a Mac at the time of writing.

import SwiftUI
import VoysembleCore

@MainActor
final class MeetingWindowModel: ObservableObject {
    @Published private(set) var window: MeetingWindow
    let now: String
    init(window: MeetingWindow = KoreaConcertTourFixture.shared.meetingWindow(), now: String = "10:52") {
        self.window = window
        self.now = now
    }
    func setSharing(_ on: Bool) {
        window = on ? window.optIn() : window.optOut()
    }
}

struct MeetingWindowView: View {
    @ObservedObject var model: MeetingWindowModel

    var body: some View {
        let w = model.window
        let open = w.isOpenAt(now: model.now)
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                Text("MEETING WINDOW").font(.caption).foregroundStyle(.secondary)
                Text(w.label).font(.largeTitle.bold())
                Text("\(w.place) · \(w.radiusMeters) m zone · \(w.startsAt)–\(w.endsAt)").font(.subheadline).foregroundStyle(.secondary)
                Label(open ? "Open · \(w.minutesLeftAt(now: model.now)) min left" : "Closed", systemImage: "clock")
                    .font(.caption).foregroundStyle(open ? .green : .secondary)
                Canvas { ctx, size in
                    let center = CGPoint(x: size.width / 2, y: size.height / 2)
                    let r = min(size.width, size.height) * 0.36
                    let zone = Path(ellipseIn: CGRect(x: center.x - r, y: center.y - r, width: 2 * r, height: 2 * r))
                    ctx.fill(zone, with: .color(.blue.opacity(0.12)))
                    ctx.stroke(zone, with: .color(.blue), lineWidth: 2)
                    for m in w.members where m.state != .optedOut {
                        let p = CGPoint(x: center.x + CGFloat(m.dx) * r * 0.9, y: center.y + CGFloat(m.dy) * r * 0.9)
                        let dot = Path(ellipseIn: CGRect(x: p.x - 8, y: p.y - 8, width: 16, height: 16))
                        ctx.fill(dot, with: .color(color(for: m.state)))
                    }
                }
                .frame(height: 260)
                .background(Color.secondary.opacity(0.08))
                .clipShape(RoundedRectangle(cornerRadius: 12))
                HStack(spacing: 12) {
                    ForEach([WindowState.inside, .outside, .uncertain, .stale, .optedOut], id: \.self) { s in
                        HStack(spacing: 4) {
                            Circle().fill(color(for: s)).frame(width: 10, height: 10)
                            Text("\(label(for: s)) \(w.count(state: s))").font(.caption)
                        }
                    }
                }
                if w.selfId != nil {
                    Toggle(isOn: Binding(get: { w.selfOptedIn }, set: { model.setSharing($0) })) {
                        VStack(alignment: .leading) {
                            Text("Share my position for this window").font(.headline)
                            Text(w.selfOptedIn ? "Sharing with leaders until \(w.endsAt). Stops automatically." : "Only while this window is open. Guardians never see it.")
                                .font(.subheadline).foregroundStyle(.secondary)
                        }
                    }
                    .disabled(!open)
                }
            }
            .padding()
        }
    }

    private func color(for s: WindowState) -> Color {
        switch s {
        case .inside: return .green
        case .outside: return .red
        case .uncertain: return .orange
        case .stale: return .gray
        case .optedOut: return .secondary
        }
    }

    private func label(for s: WindowState) -> String {
        switch s {
        case .inside: return "Inside"
        case .outside: return "Outside"
        case .uncertain: return "Uncertain"
        case .stale: return "Stale"
        case .optedOut: return "Not sharing"
        }
    }
}
