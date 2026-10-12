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
                error = failed.status == 403 ? tr(.hcCareLeadersOnly) : failed.status == 404 ? tr(.hcCareNone) : tr1(.hcCareRevealFailed, failed.error.code)
            } else {
                error = tr(.hcCareOffline)
            }
        } catch {
            self.error = tr(.hcCareOffline)
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
                    openedBy: me?.displayName ?? tr(.commonLeader), openedAtDevice: deviceClock(),
                )
                loading = false
                await push()
            } else if let failed = r as? ApiResultFailed {
                loading = false
                error = failed.status == 403 ? tr(.hcLeadersOnly) : tr1(.hcLoadFailed, failed.error.code)
            } else {
                loading = false
                error = tr(.hcOfflineRoster)
            }
        } catch {
            loading = false
            self.error = tr(.hcOfflineRoster)
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
            error = r.outcome.hasPrefix("rejected") ? tr1(.hcRefused, String(r.outcome.dropFirst("rejected:".count))) : nil
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
                    Text(tr1(.hcEyebrow, s.groupLabel).uppercased()).font(.caption).foregroundStyle(.secondary)
                    Text("\(s.presentCount) / \(s.expected)").font(.largeTitle.bold())
                    HStack(spacing: 8) {
                        Text(s.syncState == .pending ? tr(.commonPendingSync) : tr(.commonSynced)).font(.caption).foregroundStyle(s.syncState == .pending ? .orange : .green)
                        if model.live {
                            Text(model.syncing ? tr(.commonSyncing) : tr(.commonLive)).font(.caption2.weight(.semibold)).foregroundStyle(.secondary)
                            if s.syncState == .pending && !model.syncing && !s.members.isEmpty {
                                Button(tr(.commonRetrySync)) { model.retrySync() }.font(.caption)
                            }
                        } else {
                            Text(tr(.commonSampleData)).font(.caption2.weight(.semibold)).foregroundStyle(.secondary)
                        }
                    }
                    if model.loading { Text(tr(.hcLoadingRoster)).font(.caption).foregroundStyle(.secondary) }
                    if let error = model.error { Text(error).font(.caption).foregroundStyle(.red) }
                }
            }
            if !s.missing.isEmpty {
                Section(tr1(.hcMissingSection, s.missing.count)) {
                    ForEach(s.missing, id: \.id) { m in
                        VStack(alignment: .leading, spacing: 6) {
                            Text(m.name).font(.headline)
                            Text([m.room.map { tr1(.hcRoom, $0) }, m.lastAckAt.map { tr1(.hcLastAck, $0) } ?? tr(.hcNoAck)].compactMap { $0 }.joined(separator: " · "))
                                .font(.subheadline).foregroundStyle(.secondary)
                            if !s.isClosed {
                                HStack {
                                    Button(tr(.hcPresent)) { model.toggle(m.id) }.buttonStyle(.borderedProminent)
                                    Button(tr(.hcOtherGroup)) { model.withOtherGroup(m.id) }.buttonStyle(.bordered)
                                    Button(tr(.hcExcuse)) { model.excuse(m.id) }.buttonStyle(.bordered)
                                }
                            }
                        }
                    }
                }
            }
            Section(tr(.hcRosterSection)) {
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
                                .accessibilityLabel(tr1(.hcCareA11y, m.name))
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
                Text(tr2(.hcAccounted, s.accountedCount, s.expected)).font(.subheadline)
                Spacer()
                Button(s.isClosed ? tr(.hcClosed) : tr(.hcClose)) { model.close() }
                    .buttonStyle(.borderedProminent).disabled(s.isClosed)
            }
            .padding().background(.bar)
        }
        .task { if model.live && model.session.members.isEmpty { await model.load() } }
    }

    private func label(for mark: HeadcountMark) -> String {
        switch mark {
        case .present: return tr(.hcPresent)
        case .missing: return tr(.hcMissing)
        case .withOtherGroup: return tr(.hcOtherGroup)
        case .excused: return tr(.hcExcused)
        case .unmarked: return tr(.hcNotMarked)
        }
    }
}
