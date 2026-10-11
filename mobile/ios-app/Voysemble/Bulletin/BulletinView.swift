// Copyright 2026- At Day. All rights reserved.
// Bulletin & acknowledgments (atlas #9, D16). Mirrors BulletinScreen on Android. Unverified on a
// Mac at the time of writing.

import SwiftUI
import VoysembleCore

@MainActor
final class BulletinModel: ObservableObject {
    @Published private(set) var feed: AnnouncementFeed
    init(feed: AnnouncementFeed = KoreaConcertTourFixture.shared.announcements()) { self.feed = feed }
    func acknowledge(_ id: String) { feed = feed.acknowledge(id: id) }
}

struct BulletinView: View {
    @ObservedObject var model: BulletinModel

    var body: some View {
        List {
            Section {
                Text(subtitle).font(.subheadline).foregroundStyle(.secondary)
            }
            ForEach(model.feed.items, id: \.id) { a in
                VStack(alignment: .leading, spacing: 6) {
                    Text("\(a.author) · \(a.publishedAt)").font(.caption).foregroundStyle(.secondary)
                    Text(a.title).font(.headline)
                    Text(a.body)
                    if let t = a.machineTranslation {
                        VStack(alignment: .leading, spacing: 2) {
                            Label(a.translationLabel ?? "Machine translation", systemImage: "character.book.closed").font(.caption).foregroundStyle(.secondary)
                            Text(t).font(.subheadline)
                        }
                        .padding(8).background(Color.secondary.opacity(0.1)).clipShape(RoundedRectangle(cornerRadius: 8))
                    }
                    if a.requiresAck {
                        HStack {
                            switch a.ack {
                            case .unacknowledged: Button("Got it") { model.acknowledge(a.id) }.buttonStyle(.borderedProminent)
                            case .pending: Label("Queued · sends when online", systemImage: "clock").font(.subheadline)
                            case .acknowledged: Label("Acknowledged", systemImage: "checkmark").font(.subheadline)
                            }
                            Text("\(a.acknowledgedCount)/\(a.totalCount)").font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }
                .padding(.vertical, 4)
            }
        }
        .navigationTitle("Bulletin")
    }

    private var subtitle: String {
        switch model.feed.unackedRequired.count {
        case 0: return "Nothing waiting for you"
        case 1: return "1 update needs your acknowledgment"
        case let n: return "\(n) updates need your acknowledgment"
        }
    }
}
