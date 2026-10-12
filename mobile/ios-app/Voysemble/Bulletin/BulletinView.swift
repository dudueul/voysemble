// Copyright 2026- At Day. All rights reserved.
// Bulletin & acknowledgments (atlas #9, D16). Mirrors BulletinScreen on Android. Unverified on a
// Mac at the time of writing.

import SwiftUI
import VoysembleCore

@MainActor
final class BulletinModel: ObservableObject {
    @Published private(set) var feed: AnnouncementFeed
    @Published private(set) var syncing = false
    let api: ApiClient?
    let trip: ActiveTrip?
    var live: Bool { api != nil && trip != nil }

    /// Live (slice 024) with the client and the active trip: sync through core (outbox replay +
    /// fetch + merge), as BulletinViewModel on Android. Without a trip: the fixture.
    init(feed: AnnouncementFeed? = nil, api: ApiClient? = nil, trip: ActiveTrip? = nil) {
        self.api = api
        self.trip = trip
        if let feed {
            self.feed = feed
        } else if api != nil, trip != nil {
            self.feed = AnnouncementFeed(items: [], outbox: [], offline: false)
        } else {
            self.feed = KoreaConcertTourFixture.shared.announcements()
        }
    }

    /// Local first (pending + outbox), then one sync attempt that replays the outbox.
    func acknowledge(_ id: String) {
        feed = feed.acknowledge(id: id)
        if live { Task { await refresh() } }
    }

    func refresh() async {
        guard let api, let trip else { return }
        syncing = true
        defer { syncing = false }
        do {
            let result = try await BulletinSyncKt.syncBulletin(
                api: api, orgId: trip.organizationId, tripId: trip.tripId, local: feed,
                ackedAtDevice: { _ in Clocks.isoNow() }, clock: { iso in Clocks.localTime(iso) },
            )
            feed = result.feed
        } catch {
            feed = AnnouncementFeed(items: feed.items, outbox: feed.outbox, offline: true)
        }
    }
}

struct BulletinView: View {
    @ObservedObject var model: BulletinModel

    var body: some View {
        List {
            Section {
                HStack {
                    Text(subtitle).font(.subheadline).foregroundStyle(.secondary)
                    Spacer()
                    Text(model.live ? (model.syncing ? "Syncing" : (model.feed.offline ? "Offline" : "Live")) : "Sample data")
                        .font(.caption2.weight(.semibold)).foregroundStyle(.secondary)
                }
                if model.live && model.feed.items.isEmpty && !model.syncing {
                    Text("No announcements yet.").font(.subheadline).foregroundStyle(.secondary)
                }
            }
            ForEach(model.feed.items, id: \.id) { a in
                VStack(alignment: .leading, spacing: 6) {
                    Text("\(a.author) · \(a.publishedAt)").font(.caption).foregroundStyle(.secondary)
                    if a.isRevision {
                        Label("Itinerary update · rev \(a.revisionNumber.map { "\($0)" } ?? "?")", systemImage: "calendar").font(.caption.bold()).foregroundStyle(.blue)
                    }
                    Text(a.title).font(.headline)
                    Text(a.body)
                    if !a.changeLines.isEmpty {
                        VStack(alignment: .leading, spacing: 2) {
                            ForEach(Array(a.changeLines.prefix(10)), id: \.self) { line in Text("• \(line)").font(.subheadline) }
                            if a.changeLines.count > 10 { Text("and \(a.changeLines.count - 10) more").font(.caption).foregroundStyle(.secondary) }
                        }
                    }
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
        .task { await model.refresh() }
        .refreshable { await model.refresh() }
    }

    private var subtitle: String {
        switch model.feed.unackedRequired.count {
        case 0: return "Nothing waiting for you"
        case 1: return "1 update needs your acknowledgment"
        case let n: return "\(n) updates need your acknowledgment"
        }
    }
}
