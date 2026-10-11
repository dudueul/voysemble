// Copyright 2026- At Day. All rights reserved.
// Leader incident cards (D17). Mirrors IncidentsScreen on Android; rules in core. Sample mode
// only this slice (the live feed rides the same core API as Android in a later slice).

import SwiftUI
import VoysembleCore

@MainActor
final class IncidentsModel: ObservableObject {
    @Published private(set) var feed: IncidentFeed
    private let deviceClock: () -> String

    init(feed: IncidentFeed = KoreaConcertTourFixture.shared.incidents(), deviceClock: @escaping () -> String = { "07:12" }) {
        self.feed = feed
        self.deviceClock = deviceClock
    }

    func confirm(_ id: String, _ status: ConfirmationStatus) {
        feed = feed.confirmLocally(id: id, status: status, note: nil, byName: "Kim Daeun", atDevice: deviceClock())
    }
}

struct IncidentsView: View {
    @ObservedObject var model: IncidentsModel

    var body: some View {
        let open = model.feed.cards.filter { $0.isOpen }
        let closed = model.feed.cards.filter { !$0.isOpen }
        List {
            Section {
                VStack(alignment: .leading, spacing: 4) {
                    Text("INCIDENTS").font(.caption).foregroundStyle(.secondary)
                    Text(open.isEmpty ? "Nothing open" : "\(open.count) open").font(.largeTitle.bold())
                    Text("Answer what you see; the organizer tells the guardian.").font(.caption).foregroundStyle(.secondary)
                }
            }
            if !open.isEmpty {
                Section("Open") { ForEach(open, id: \.id) { card in row(card) } }
            }
            if !closed.isEmpty {
                Section("Resolved") { ForEach(closed, id: \.id) { card in row(card) } }
            }
        }
        .navigationTitle("Incidents")
    }

    @ViewBuilder
    private func row(_ card: IncidentCard) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(card.title).font(.headline)
                Spacer()
                Text(card.isOpen ? "Open" : "Resolved").font(.caption.bold()).foregroundStyle(card.isOpen ? .red : .green)
            }
            Text("\(card.people.joined(separator: ", ")) · opened \(card.openedAt) · \(card.openedBy)").font(.caption).foregroundStyle(.secondary)
            if let latest = card.latest {
                HStack(spacing: 6) {
                    Text(IncidentsModelKt.labelOf(status: latest.status)).font(.caption.bold()).foregroundStyle(latest.status == .withGroup ? .green : .orange)
                    Text("\(latest.byName) · \(latest.at)").font(.caption).foregroundStyle(.secondary)
                    if card.pending != nil { Text("Pending sync").font(.caption).foregroundStyle(.orange) }
                }
                if let note = latest.note { Text(note).font(.subheadline) }
            } else {
                Text("Not confirmed yet").font(.subheadline.bold()).foregroundStyle(.orange)
            }
            if let msg = card.guardianMessage {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Guardian message sent").font(.caption).foregroundStyle(.secondary)
                    Text(msg).font(.subheadline)
                }
                .padding(8).background(Color.green.opacity(0.1)).clipShape(RoundedRectangle(cornerRadius: 8))
            }
            if card.isOpen {
                HStack {
                    Button("With group") { model.confirm(card.id, .withGroup) }.buttonStyle(.borderedProminent)
                    Button("Not with group") { model.confirm(card.id, .notWithGroup) }.buttonStyle(.bordered)
                    Button("Unknown") { model.confirm(card.id, .unknown) }.buttonStyle(.bordered)
                }
                .font(.caption)
            }
        }
        .padding(.vertical, 4)
    }
}
