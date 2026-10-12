// Copyright 2026- At Day. All rights reserved.
// Leader incident cards (D17). Mirrors IncidentsScreen on Android; rules in core. Sample mode
// only this slice (the live feed rides the same core API as Android in a later slice).

import SwiftUI
import VoysembleCore

@MainActor
final class IncidentsModel: ObservableObject {
    @Published private(set) var feed: IncidentFeed
    @Published private(set) var syncing = false
    @Published private(set) var error: String?
    let api: ApiClient?
    let trip: ActiveTrip?
    var live: Bool { api != nil && trip != nil }
    private let deviceClock: () -> String

    /// Live (slice 024) with the client and the active trip: the feed from the API, answers
    /// recorded locally first and sent once, pending ones replayed before each refresh (rules in
    /// core, as IncidentsViewModel on Android). Without a trip: the fixture with a fixed clock.
    init(feed: IncidentFeed? = nil, deviceClock: (() -> String)? = nil, api: ApiClient? = nil, trip: ActiveTrip? = nil) {
        self.api = api
        self.trip = trip
        let isLive = api != nil && trip != nil
        let liveClock: () -> String = { Clocks.now() }
        let fixedClock: () -> String = { "07:12" }
        self.deviceClock = deviceClock ?? (isLive ? liveClock : fixedClock)
        if let feed {
            self.feed = feed
        } else if isLive {
            self.feed = IncidentFeed(cards: [], offline: false)
        } else {
            self.feed = KoreaConcertTourFixture.shared.incidents()
        }
    }

    /// Local first (pending), then one send; a failed send leaves the answer pending for the next refresh.
    func confirm(_ id: String, _ status: ConfirmationStatus) {
        feed = feed.confirmLocally(id: id, status: status, note: nil, byName: live ? tr(.commonMe) : "Kim Daeun", atDevice: deviceClock())
        if live { Task { await send(id) } }
    }

    func refresh() async {
        guard let api, let trip else { return }
        syncing = true
        error = nil
        defer { syncing = false }
        for card in feed.cards where card.pending != nil { await send(card.id) }
        do {
            let r = try await api.listIncidents(orgId: trip.organizationId, tripId: trip.tripId, correlationId: nil)
            if let list = (r as? ApiResultOk<IncidentListDto>)?.value {
                feed = IncidentsKt.mergeIncidents(local: feed, remote: list.incidents, clock: { iso in Clocks.localTime(iso) }, locale: Locale.current.language.languageCode?.identifier ?? "en")
            } else if let failed = r as? ApiResultFailed {
                error = failed.status == 403 ? tr(.incLeadersOnly) : tr1(.incLoadFailed, failed.error.code)
            } else {
                feed = IncidentFeed(cards: feed.cards, offline: true)
            }
        } catch {
            feed = IncidentFeed(cards: feed.cards, offline: true)
        }
    }

    private func send(_ id: String) async {
        guard let api, let trip, let pending = feed.cards.first(where: { $0.id == id })?.pending else { return }
        do {
            let r = try await api.confirmIncident(
                orgId: trip.organizationId, tripId: trip.tripId, incidentId: id,
                body: IncidentsKt.confirmRequestOf(confirmation: pending), correlationId: nil,
            )
            if r is ApiResultOk<IncidentDto> {
                feed = feed.confirmed(id: id)
                error = nil
            } else if r is ApiResultFailed {
                error = tr(.incRefused)
            } else {
                feed = IncidentFeed(cards: feed.cards, offline: true)
            }
        } catch {
            feed = IncidentFeed(cards: feed.cards, offline: true)
        }
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
                    Text(tr(.incEyebrow).uppercased()).font(.caption).foregroundStyle(.secondary)
                    Text(open.isEmpty ? tr(.incNothingOpen) : tr1(.incOpenCount, open.count)).font(.largeTitle.bold())
                    Text(tr(.incSubtitle)).font(.caption).foregroundStyle(.secondary)
                    Text(model.live ? (model.syncing ? tr(.commonSyncing) : (model.feed.offline ? tr(.commonOffline) : tr(.commonLive))) : tr(.commonSampleData))
                        .font(.caption2.weight(.semibold)).foregroundStyle(.secondary)
                    if let error = model.error { Text(error).font(.caption).foregroundStyle(.red) }
                }
            }
            if !open.isEmpty {
                Section(tr(.incOpen)) { ForEach(open, id: \.id) { card in row(card) } }
            }
            if !closed.isEmpty {
                Section(tr(.incResolved)) { ForEach(closed, id: \.id) { card in row(card) } }
            }
        }
        .navigationTitle(tr(.incEyebrow))
        .task { await model.refresh() }
        .refreshable { await model.refresh() }
    }

    @ViewBuilder
    private func row(_ card: IncidentCard) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(card.title).font(.headline)
                Spacer()
                Text(card.isOpen ? tr(.incOpen) : tr(.incResolved)).font(.caption.bold()).foregroundStyle(card.isOpen ? .red : .green)
            }
            Text(tr3(.incMeta, card.people.joined(separator: ", "), card.openedAt, card.openedBy)).font(.caption).foregroundStyle(.secondary)
            if let latest = card.latest {
                HStack(spacing: 6) {
                    Text(IncidentsModelKt.labelOf(status: latest.status)).font(.caption.bold()).foregroundStyle(latest.status == .withGroup ? .green : .orange)
                    Text("\(latest.byName) · \(latest.at)").font(.caption).foregroundStyle(.secondary)
                    if card.pending != nil { Text(tr(.commonPendingSync)).font(.caption).foregroundStyle(.orange) }
                }
                if let note = latest.note { Text(note).font(.subheadline) }
            } else {
                Text(tr(.incNotConfirmed)).font(.subheadline.bold()).foregroundStyle(.orange)
            }
            if let msg = card.guardianMessage {
                VStack(alignment: .leading, spacing: 2) {
                    Text(tr(.incGuardianSent)).font(.caption).foregroundStyle(.secondary)
                    Text(msg).font(.subheadline)
                }
                .padding(8).background(Color.green.opacity(0.1)).clipShape(RoundedRectangle(cornerRadius: 8))
            }
            if card.isOpen {
                HStack {
                    Button(tr(.incWithGroup)) { model.confirm(card.id, .withGroup) }.buttonStyle(.borderedProminent)
                    Button(tr(.incNotWithGroup)) { model.confirm(card.id, .notWithGroup) }.buttonStyle(.bordered)
                    Button(tr(.incUnknown)) { model.confirm(card.id, .unknown) }.buttonStyle(.bordered)
                }
                .font(.caption)
            }
        }
        .padding(.vertical, 4)
    }
}
