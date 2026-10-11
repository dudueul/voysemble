// Copyright 2026- At Day. All rights reserved.
// Leader head count (atlas #15, D14, D25). Mirrors HeadcountScreen on Android; rules in core.
// Unverified on a Mac at the time of writing (see mobile/README.md).

import SwiftUI
import VoysembleCore

@MainActor
final class HeadcountModel: ObservableObject {
    @Published private(set) var session: HeadcountSession
    private let deviceClock: () -> String

    init(session: HeadcountSession = KoreaConcertTourFixture.shared.headcountBusA(), deviceClock: @escaping () -> String = { "06:58" }) {
        self.session = session
        self.deviceClock = deviceClock
    }

    func toggle(_ id: String) { session = HeadcountModelKt.togglePresent(session, memberId: id) }
    func excuse(_ id: String) { session = HeadcountModelKt.mark(session, memberId: id, mark: .excused) }
    func withOtherGroup(_ id: String) { session = HeadcountModelKt.mark(session, memberId: id, mark: .withOtherGroup) }
    func close() { session = HeadcountModelKt.close(session, atDevice: deviceClock()) }
}

struct HeadcountView: View {
    @ObservedObject var model: HeadcountModel

    var body: some View {
        let s = model.session
        List {
            Section {
                VStack(alignment: .leading, spacing: 4) {
                    Text("HEAD COUNT · \(s.groupLabel)").font(.caption).foregroundStyle(.secondary)
                    Text("\(s.presentCount) / \(s.expected)").font(.largeTitle.bold())
                    Text(s.syncState == .pending ? "Pending sync" : "Synced").font(.caption).foregroundStyle(s.syncState == .pending ? .orange : .green)
                }
            }
            if !s.missing.isEmpty {
                Section("\(s.missing.count) missing") {
                    ForEach(s.missing, id: \.id) { m in
                        VStack(alignment: .leading, spacing: 6) {
                            Text(m.name).font(.headline)
                            Text([m.room.map { "Room \($0)" }, m.lastAckAt.map { "last ack \($0)" } ?? "no ack today"].compactMap { $0 }.joined(separator: " · "))
                                .font(.subheadline).foregroundStyle(.secondary)
                            if !s.isClosed {
                                HStack {
                                    Button("Present") { model.toggle(m.id) }.buttonStyle(.borderedProminent)
                                    Button("Other group") { model.withOtherGroup(m.id) }.buttonStyle(.bordered)
                                    Button("Excuse") { model.excuse(m.id) }.buttonStyle(.bordered)
                                }
                            }
                        }
                    }
                }
            }
            Section("Roster · tap to mark present") {
                ForEach(s.members, id: \.id) { m in
                    let mark = s.markOf(memberId: m.id)
                    HStack {
                        Image(systemName: mark == .present ? "checkmark.circle.fill" : "circle").foregroundStyle(mark == .present ? .green : .secondary)
                        Text(m.name)
                        Spacer()
                        Text(label(for: mark)).font(.caption).foregroundStyle(.secondary)
                    }
                    .contentShape(Rectangle())
                    .onTapGesture { if !s.isClosed { model.toggle(m.id) } }
                }
            }
        }
        .safeAreaInset(edge: .bottom) {
            HStack {
                Text("\(s.accountedCount) of \(s.expected) accounted for").font(.subheadline)
                Spacer()
                Button(s.isClosed ? "Closed" : "Close head count") { model.close() }
                    .buttonStyle(.borderedProminent).disabled(s.isClosed)
            }
            .padding().background(.bar)
        }
    }

    private func label(for mark: HeadcountMark) -> String {
        switch onEnum(of: mark) {
        case .present: return "Present"
        case .missing: return "Missing"
        case .withOtherGroup: return "Other group"
        case .excused: return "Excused"
        case .unmarked: return "Not marked"
        }
    }
}
