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
    /// Slice 073: the travelers a leader may name on a card opened by hand; nil until asked.
    @Published private(set) var travelers: [ParticipationDto]?
    @Published private(set) var openError: String?
    let api: ApiClient?
    let trip: ActiveTrip?
    var live: Bool { api != nil && trip != nil }
    /// Slice 073: a leader opens a card by hand; the sample lets anyone try it.
    var canOpen: Bool { trip == nil || trip?.role == "leader" }
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

    /// Slice 073: the roster's travelers of the leader's group (every traveler for a whole-trip leader); the fixture's in sample mode.
    func loadTravelers() async {
        guard let api, let trip else {
            travelers = KoreaConcertTourFixture.shared.rosterForIncidents()
            return
        }
        do {
            let r = try await api.listRoster(orgId: trip.organizationId, tripId: trip.tripId, correlationId: nil)
            if let roster = (r as? ApiResultOk<RosterResponseDto>)?.value {
                let mine = roster.participations.first(where: { $0.id == trip.participationId })?.groupName
                travelers = IncidentsKt.openableTravelers(roster: roster.participations, groupName: mine)
                openError = nil
            } else if let failed = r as? ApiResultFailed {
                openError = tr1(.incNewFailed, failed.error.code)
            } else {
                openError = tr(.commonOffline)
            }
        } catch {
            openError = tr(.commonOffline)
        }
    }

    /// Slice 073: open a card naming travelers; the server's card lands through a refresh, sample mode keeps a local one.
    func openIncident(title: String, participationIds: [String]) async {
        let text = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, !participationIds.isEmpty else { return }
        guard let api, let trip else {
            let names = (travelers ?? []).filter { participationIds.contains($0.id) }.map { $0.displayName }
            let card = IncidentsKt.localIncidentCard(id: "local-\(participationIds.joined(separator: "-"))", title: text, people: names, openedBy: "Kim Daeun", atDevice: deviceClock())
            feed = IncidentFeed(cards: [card] + feed.cards, offline: feed.offline)
            return
        }
        do {
            let r = try await api.openIncident(orgId: trip.organizationId, tripId: trip.tripId, body: OpenIncidentRequestDto(title: text, participationIds: participationIds), correlationId: nil)
            if r is ApiResultOk<IncidentDto> {
                openError = nil
                await refresh()
            } else if let failed = r as? ApiResultFailed {
                openError = tr1(.incNewFailed, failed.error.code)
            } else {
                openError = tr(.commonOffline)
            }
        } catch {
            openError = tr(.commonOffline)
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
    // Slice 073: the sheet a leader fills to open a card by hand.
    @State private var composing = false

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
        .toolbar {
            if model.canOpen {
                ToolbarItem(placement: .topBarTrailing) {
                    Button(tr(.incNew)) {
                        composing = true
                        Task { await model.loadTravelers() }
                    }
                }
            }
        }
        .sheet(isPresented: $composing) {
            NavigationStack {
                NewIncidentForm(travelers: model.travelers, error: model.openError) { title, ids in
                    composing = false
                    Task { await model.openIncident(title: title, participationIds: ids) }
                }
                .navigationTitle(tr(.incNew))
                .navigationBarTitleDisplayMode(.inline)
            }
        }
        .task { await model.refresh() }
        .refreshable { await model.refresh() }
    }

    @ViewBuilder
    private func row(_ card: IncidentCard) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(card.title).font(.headline)
                Spacer()
                // Slice 079: where the card came from; a traveler's own request stands out.
                Text(IncidentsModelKt.labelOfKind(kind: card.kind))
                    .font(.caption.bold())
                    .foregroundStyle(card.kind == IncidentKind.help ? .orange : .secondary)
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

/// Slice 073: what happened and the travelers of the leader's group as toggles; its own view so a
/// capture renders it without a sheet.
struct NewIncidentForm: View {
    let travelers: [ParticipationDto]?
    let error: String?
    let onOpen: (String, [String]) -> Void
    @State private var title = ""
    @State private var chosen: Set<String> = []

    var body: some View {
        Form {
            Section {
                Text(tr(.incNewHint)).font(.subheadline).foregroundStyle(.secondary)
                TextField(tr(.incNewTitle), text: $title, axis: .vertical).lineLimit(1...3)
            }
            Section(tr(.incNewPeople)) {
                if let travelers {
                    if travelers.isEmpty { Text(tr(.incNone)).foregroundStyle(.secondary) }
                    ForEach(travelers, id: \.id) { p in
                        Toggle(isOn: Binding(
                            get: { chosen.contains(p.id) },
                            set: { on in if on { chosen.insert(p.id) } else { chosen.remove(p.id) } }
                        )) {
                            HStack(spacing: 6) {
                                Text(p.displayName)
                                if let group = p.groupName { Text("· \(group)").foregroundStyle(.secondary) }
                            }
                        }
                        .accessibilityLabel(tr1(.incNewPersonSpoken, p.displayName))
                    }
                } else {
                    Text(tr(.commonSyncing)).foregroundStyle(.secondary)
                }
            }
            if let error { Text(error).foregroundStyle(.red) }
            Section {
                Button(tr(.incNewOpen)) { onOpen(title, Array(chosen)) }
                    .voyButton(prominent: true)
                    .disabled(title.trimmingCharacters(in: .whitespaces).isEmpty || chosen.isEmpty)
            }
        }
    }
}
