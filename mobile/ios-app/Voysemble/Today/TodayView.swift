// Copyright 2026- At Day. All rights reserved.
//
// Mobile Today screen (SwiftUI). Same structure as the Compose screen: header with day + sync,
// green "Up next" card, latest announcement with acknowledgment, head count, later-today list,
// five tabs. Status is never color-only.

import SwiftUI
import VoysembleCore

struct TodayView: View {
    @StateObject var model: TodayModel

    var body: some View {
        TabView(selection: $model.tab) {
            todayTab.tabItem { Label("Today", systemImage: "calendar") }.tag(MainTab.today)
            placeholder("Plan").tabItem { Label("Plan", systemImage: "list.bullet.rectangle") }.tag(MainTab.plan)
            placeholder("Bulletin").tabItem { Label("Bulletin", systemImage: "bell") }.tag(MainTab.bulletin)
            placeholder("Chats").tabItem { Label("Chats", systemImage: "bubble.left") }.tag(MainTab.chats)
            placeholder("Memories").tabItem { Label("Memories", systemImage: "photo.on.rectangle") }.tag(MainTab.memories)
        }
        .tint(Color(argb: Tokens.Color.Light.brand))
    }

    private var todayTab: some View {
        let s = model.snapshot
        return ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                header(s)
                if s.offline { offlineBanner }
                if let next = s.upNext { UpNextCard(event: next, timeZone: s.timeZoneLabel) }
                if let a = s.announcement { AnnouncementCard(announcement: a) { model.acknowledge($0) } }
                HeadcountCard(groups: s.headcount, checkedIn: Int(s.checkedIn), expected: Int(s.expected))
                Text("Later today").font(.headline).padding(.top, 4)
                ForEach(s.later, id: \.id) { EventRow(event: $0) }
            }
            .padding(16)
        }
        .background(Color(argb: Tokens.Color.Light.bg))
    }

    private func header(_ s: TodaySnapshot) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("\(s.tripName.uppercased()) · DAY \(s.dayNumber)")
                .font(.caption2.weight(.semibold)).foregroundStyle(.secondary)
            HStack {
                Text("Today").font(.largeTitle.bold())
                Spacer()
                Text("Sample data").font(.caption2.weight(.semibold))
                    .foregroundStyle(Color(argb: Tokens.Color.Light.pending))
                    .padding(.horizontal, 10).padding(.vertical, 3)
                    .background(Capsule().fill(Color(argb: Tokens.Color.Light.pending).opacity(0.1)))
            }
            HStack(spacing: 6) {
                Text("\(s.dateLabel) · \(s.timeZoneLabel)")
                Text("·")
                Image(systemName: "arrow.triangle.2.circlepath").foregroundStyle(Color(argb: Tokens.Color.Light.success))
                Text(syncText(s.minutesSinceSync))
            }
            .font(.subheadline).foregroundStyle(.secondary)
        }
    }

    private func syncText(_ minutes: KotlinInt?) -> String {
        guard let m = minutes?.intValue else { return "Not synced yet" }
        return m == 0 ? "Synced just now" : "Synced \(m) min ago"
    }

    private var offlineBanner: some View {
        HStack(spacing: 8) {
            Image(systemName: "wifi.slash")
            Text("Offline. Showing the last synced plan.")
        }
        .font(.subheadline.weight(.semibold))
        .foregroundStyle(Color(argb: Tokens.Color.Light.warning))
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 12).fill(Color(argb: Tokens.Color.Light.warning).opacity(0.14)))
    }

    private func placeholder(_ name: String) -> some View {
        VStack(spacing: 8) {
            Text("\(name) is not built yet").font(.headline)
            Text("Status in feature-status.json is \"deferred\".").foregroundStyle(.secondary)
        }
    }
}

private struct UpNextCard: View {
    let event: TodayEvent
    let timeZone: String
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("UP NEXT").font(.caption2.weight(.semibold)).opacity(0.8)
            Text(event.title).font(.title3.bold())
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(event.end.map { "\(event.start) – \($0)" } ?? event.start).font(.largeTitle.bold())
                Text(timeZone).font(.subheadline).opacity(0.8)
            }
            Label(event.place, systemImage: "mappin").font(.body)
            if let note = event.note { Text(note).font(.subheadline).opacity(0.85) }
            Button {
            } label: {
                Label(event.isMeetingPoint ? "Meeting point" : "Directions", systemImage: "map")
                    .padding(.horizontal, 14).padding(.vertical, 8)
                    .background(RoundedRectangle(cornerRadius: 12).fill(.white.opacity(0.16)))
            }
            .padding(.top, 4)
        }
        .foregroundStyle(Color(argb: Tokens.Color.Light.onAction))
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 16).fill(Color(argb: Tokens.Color.Light.action)))
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Up next: \(event.title) at \(event.start)")
    }
}

private struct AnnouncementCard: View {
    let announcement: TodayAnnouncement
    let onAcknowledge: (String) -> Void
    var body: some View {
        Card {
            HStack {
                Text("LATEST UPDATE").font(.caption2.weight(.semibold)).foregroundStyle(.secondary)
                Spacer()
                Text("\(announcement.author) · \(announcement.publishedAt)").font(.subheadline).foregroundStyle(.secondary)
            }
            Text(announcement.title).font(.headline).padding(.top, 6)
            Text(announcement.body).font(.body).foregroundStyle(.secondary).padding(.top, 2)
            HStack(spacing: 10) {
                switch onEnum(of: announcement.ack) {
                case .unacknowledged:
                    Button("Acknowledge") { onAcknowledge(announcement.id) }
                        .buttonStyle(.borderedProminent)
                        .tint(Color(argb: Tokens.Color.Light.action))
                case .pending:
                    Label("Queued · sends when online", systemImage: "clock").font(.subheadline.weight(.semibold)).foregroundStyle(.secondary)
                case .acknowledged:
                    Label("Acknowledged", systemImage: "checkmark").font(.subheadline.weight(.semibold)).foregroundStyle(.secondary)
                }
                Text("\(announcement.acknowledgedCount)/\(announcement.totalCount) acknowledged").font(.subheadline).foregroundStyle(.secondary)
            }
            .padding(.top, 10)
        }
    }
}

private struct HeadcountCard: View {
    let groups: [HeadcountGroup]
    let checkedIn: Int
    let expected: Int
    var body: some View {
        Card {
            HStack {
                Text("HEAD COUNT").font(.caption2.weight(.semibold)).foregroundStyle(.secondary)
                Spacer()
                Text("\(checkedIn) / \(expected) checked in").font(.subheadline.weight(.semibold))
            }
            ForEach(groups, id: \.label) { g in
                let short = g.checkedIn < g.expected
                HStack(spacing: 10) {
                    Text(g.label).font(.subheadline).frame(width: 48, alignment: .leading)
                    ProgressView(value: Double(g.checkedIn), total: Double(max(g.expected, 1)))
                        .tint(Color(argb: short ? Tokens.Color.Light.warning : Tokens.Color.Light.action))
                    Text(short ? "\(g.checkedIn)/\(g.expected) · \(g.expected - g.checkedIn) missing" : "\(g.checkedIn)/\(g.expected)")
                        .font(.subheadline)
                }
                .padding(.top, 6)
            }
        }
    }
}

private struct EventRow: View {
    let event: TodayEvent
    var body: some View {
        HStack(alignment: .center, spacing: 12) {
            VStack(alignment: .leading) {
                Text(event.start).font(.body.weight(.semibold))
                if let end = event.end { Text("– \(end)").font(.caption2).foregroundStyle(.secondary) }
            }
            .frame(width: 52, alignment: .leading)
            Image(systemName: symbol(event.kind))
                .frame(width: 36, height: 36)
                .background(RoundedRectangle(cornerRadius: 10).stroke(Color(argb: Tokens.Color.Light.border)))
                .foregroundStyle(.secondary)
            VStack(alignment: .leading, spacing: 2) {
                Text(event.title).font(.body.weight(.semibold))
                Text(event.place).font(.subheadline).foregroundStyle(.secondary)
                if let note = event.note { Text(note).font(.caption2.weight(.semibold)).foregroundStyle(Color(argb: Tokens.Color.Light.warning)) }
            }
            Spacer()
            StatusChip(status: event.status)
        }
        .padding(.vertical, 6)
    }

    private func symbol(_ kind: EventKind) -> String {
        switch onEnum(of: kind) {
        case .flight: return "airplane"
        case .bus: return "bus"
        case .meal: return "fork.knife"
        case .activity: return "flag"
        case .hotel: return "building.2"
        case .meeting: return "mappin"
        case .free: return "calendar"
        }
    }
}

private struct StatusChip: View {
    let status: EventStatus
    var body: some View {
        let (label, color): (String, UInt32) = {
            switch onEnum(of: status) {
            case .scheduled: return ("Scheduled", Tokens.Color.Light.textMuted)
            case .inProgress: return ("Now", Tokens.Color.Light.action)
            case .done: return ("Done", Tokens.Color.Light.success)
            case .delayed: return ("Delayed", Tokens.Color.Light.warning)
            case .cancelled: return ("Cancelled", Tokens.Color.Light.danger)
            }
        }()
        Text(label).font(.caption2.weight(.semibold))
            .foregroundStyle(Color(argb: color))
            .padding(.horizontal, 9).padding(.vertical, 3)
            .background(Capsule().fill(Color(argb: color).opacity(0.12)))
    }
}

private struct Card<Content: View>: View {
    @ViewBuilder let content: () -> Content
    var body: some View {
        VStack(alignment: .leading, spacing: 0, content: content)
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: 16).fill(Color(argb: Tokens.Color.Light.surface)))
            .overlay(RoundedRectangle(cornerRadius: 16).stroke(Color(argb: Tokens.Color.Light.border)))
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
