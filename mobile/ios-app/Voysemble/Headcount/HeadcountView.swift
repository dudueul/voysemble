// Copyright 2026- At Day. All rights reserved.
// Leader head count (atlas #15, D14, D25). Mirrors HeadcountScreen on Android; rules in core.
// Unverified on a Mac at the time of writing (see mobile/README.md).

import SwiftUI
import VoysembleCore

@MainActor
final class HeadcountModel: ObservableObject {
    @Published private(set) var session: HeadcountSession
    @Published private(set) var loading = false
    @Published private(set) var syncing = false
    /// Safe, user-facing text; nil when the last step succeeded.
    @Published private(set) var error: String?
    /// Last push outcome from core (`synced`, `already-closed`, `rejected:<status>`, `offline`).
    @Published private(set) var lastPush: String?
    /// Care notes revealed on this screen (D27): member id to one line. Memory only; never stored.
    @Published private(set) var revealed: [String: String] = [:]
    let api: ApiClient?
    let trip: ActiveTrip?
    var live: Bool { api != nil && trip != nil }
    private let deviceClock: () -> String
    private let newId: () -> String

    /// Live (slice 024) with the client and the active trip: the roster seeds the leader's own
    /// group, every close pushes once, marks made during a push win (rules in core, as on
    /// Android). Without a trip: the fixture with a fixed clock for screenshots.
    init(
        session: HeadcountSession? = nil,
        deviceClock: (() -> String)? = nil,
        api: ApiClient? = nil,
        trip: ActiveTrip? = nil,
        newId: @escaping () -> String = { UUID().uuidString.lowercased() },
    ) {
        self.api = api
        self.trip = trip
        self.newId = newId
        let isLive = api != nil && trip != nil
        let liveClock: () -> String = { Clocks.now() }
        let fixedClock: () -> String = { "06:58" }
        self.deviceClock = deviceClock ?? (isLive ? liveClock : fixedClock)
        if let session {
            self.session = session
        } else if isLive {
            self.session = HeadcountSession(id: "", groupLabel: "", openedBy: "", openedAtDevice: "", closedAtDevice: nil, members: [], marks: [:], syncState: .pending)
            self.loading = true
        } else {
            self.session = KoreaConcertTourFixture.shared.headcountBusA()
        }
    }

    func toggle(_ id: String) { session = session.togglePresent(memberId: id) }
    func excuse(_ id: String) { session = session.mark(memberId: id, mark: .excused) }
    func withOtherGroup(_ id: String) { session = session.mark(memberId: id, mark: .withOtherGroup) }

    /// Local close first (final), then one push.
    func close() {
        session = session.close(atDevice: deviceClock())
        if live { Task { await push() } }
    }

    /// For the "Pending sync" chip: push again without changing anything on the device.
    func retrySync() { Task { await push() } }

    /// Reveal (audited on the server) or, in sample mode, the fixture note.
    func revealCare(_ id: String) {
        if live {
            Task { await revealCareNow(id) }
        } else {
            revealed[id] = CareKt.careLineOf(note: KoreaConcertTourFixture.shared.careNote())
        }
    }

    func hideCare(_ id: String) { revealed[id] = nil }

    func revealCareNow(_ id: String) async {
        guard let api, let trip else { return }
        do {
            let r = try await api.revealCareNote(orgId: trip.organizationId, tripId: trip.tripId, participationId: id, correlationId: nil)
            if let ok = (r as? ApiResultOk<RevealCareNoteResponseDto>)?.value {
                revealed[id] = CareKt.careLineOf(note: ok.note)
            } else if let failed = r as? ApiResultFailed {
                error = failed.status == 403 ? "Only this group's leaders see the care note." : failed.status == 404 ? "No care note on file." : "Could not reveal the care note (\(failed.error.code))."
            } else {
                error = "Offline. Care notes are never cached on the device."
            }
        } catch {
            self.error = "Offline. Care notes are never cached on the device."
        }
    }

    /// Roster -> the leader's own group (whole trip when the leader has none) -> open-session push.
    func load() async {
        guard let api, let trip else { return }
        loading = true
        error = nil
        do {
            let r = try await api.listRoster(orgId: trip.organizationId, tripId: trip.tripId, correlationId: nil)
            if let roster = (r as? ApiResultOk<RosterResponseDto>)?.value {
                let me = roster.participations.first { $0.id == trip.participationId }
                session = HeadcountsKt.headcountFromRoster(
                    id: newId(), roster: roster.participations, groupName: me?.groupName,
                    openedBy: me?.displayName ?? "Leader", openedAtDevice: deviceClock(),
                )
                loading = false
                await push()
            } else if let failed = r as? ApiResultFailed {
                loading = false
                error = failed.status == 403 ? "Only trip leaders and organizers count heads." : "Could not load the roster (\(failed.error.code))."
            } else {
                loading = false
                error = "Offline. The roster needs one connection to start a count."
            }
        } catch {
            loading = false
            self.error = "Offline. The roster needs one connection to start a count."
        }
    }

    private func push() async {
        guard let api, let trip, session.syncState != .synced else { return }
        syncing = true
        defer { syncing = false }
        do {
            let r = try await HeadcountsKt.pushHeadcount(api: api, orgId: trip.organizationId, tripId: trip.tripId, session: session)
            session = session.adoptPush(result: r)
            lastPush = r.outcome
            error = r.outcome.hasPrefix("rejected") ? "The server refused this count (\(r.outcome.dropFirst("rejected:".count)))." : nil
        } catch {
            lastPush = "offline"
        }
    }
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
                    HStack(spacing: 8) {
                        Text(s.syncState == .pending ? "Pending sync" : "Synced").font(.caption).foregroundStyle(s.syncState == .pending ? .orange : .green)
                        if model.live {
                            Text(model.syncing ? "Syncing" : "Live").font(.caption2.weight(.semibold)).foregroundStyle(.secondary)
                            if s.syncState == .pending && !model.syncing && !s.members.isEmpty {
                                Button("Retry sync") { model.retrySync() }.font(.caption)
                            }
                        } else {
                            Text("Sample data").font(.caption2.weight(.semibold)).foregroundStyle(.secondary)
                        }
                    }
                    if model.loading { Text("Loading the roster…").font(.caption).foregroundStyle(.secondary) }
                    if let error = model.error { Text(error).font(.caption).foregroundStyle(.red) }
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
                    VStack(alignment: .leading, spacing: 4) {
                        HStack {
                            Image(systemName: mark == .present ? "checkmark.circle.fill" : "circle").foregroundStyle(mark == .present ? .green : .secondary)
                            Text(m.name)
                            if m.hasCareNote {
                                // D27: one tap, audited; the line stays only while this screen is open.
                                Button {
                                    if model.revealed[m.id] == nil { model.revealCare(m.id) } else { model.hideCare(m.id) }
                                } label: {
                                    Image(systemName: "cross.case").foregroundStyle(.orange)
                                }
                                .buttonStyle(.plain)
                                .accessibilityLabel("Care note for \(m.name)")
                            }
                            Spacer()
                            Text(label(for: mark)).font(.caption).foregroundStyle(.secondary)
                        }
                        .contentShape(Rectangle())
                        .onTapGesture { if !s.isClosed { model.toggle(m.id) } }
                        if let line = model.revealed[m.id] {
                            Text(line).font(.caption).foregroundStyle(.orange)
                        }
                    }
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
        .task { if model.live && model.session.members.isEmpty { await model.load() } }
    }

    private func label(for mark: HeadcountMark) -> String {
        switch mark {
        case .present: return "Present"
        case .missing: return "Missing"
        case .withOtherGroup: return "Other group"
        case .excused: return "Excused"
        case .unmarked: return "Not marked"
        }
    }
}
