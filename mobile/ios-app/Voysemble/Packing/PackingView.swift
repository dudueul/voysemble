// Copyright 2026- At Day. All rights reserved.
// Packing checklist (D38, slice 048). Mirrors PackingScreen on Android; rules in core
// (packing/PackingModel.kt). Live with a client and a trip: my list from the API (a traveler's
// or leader's own, a guardian's for their traveler), a tick flipped here first and confirmed by
// the server's item (a failure or no connection puts it back and says so). Without a trip: the
// fixture list. Reached from the Today tab's packing card.

import SwiftUI
import VoysembleCore

@MainActor
final class PackingModel: ObservableObject {
    @Published private(set) var list: PackingList
    @Published private(set) var syncing = false
    @Published private(set) var error: String?
    /// One line after a tick that did not reach the server.
    @Published private(set) var notice: String?
    /// Items whose tick is on its way; their rows are disabled meanwhile.
    @Published private(set) var pending: Set<String> = []
    let api: ApiClient?
    let trip: ActiveTrip?
    var live: Bool { api != nil && trip != nil }

    init(list: PackingList? = nil, api: ApiClient? = nil, trip: ActiveTrip? = nil) {
        self.api = api
        self.trip = trip
        if let list {
            self.list = list
        } else if trip != nil, api != nil {
            self.list = PackingModelKt.emptyPackingList()
        } else {
            self.list = KoreaConcertTourFixture.shared.packing()
        }
    }

    func refresh() async {
        guard let api, let trip else { return }
        syncing = true
        defer { syncing = false }
        do {
            let r = try await api.myPacking(orgId: trip.organizationId, tripId: trip.tripId, correlationId: nil)
            if let dto = (r as? ApiResultOk<MyPackingListDto>)?.value {
                list = PackingModelKt.packingOf(dto: dto)
                error = nil
            } else if let failed = r as? ApiResultFailed {
                error = tr1(.packLoadFailed, failed.error.code)
            } else {
                list = list.withOffline(offline: true)
                error = tr(.packOffline)
            }
        } catch {
            list = list.withOffline(offline: true)
            self.error = tr(.packOffline)
        }
    }

    /// Flip locally first; the server's item replaces it, a failure puts the old one back.
    func setPacked(_ itemId: String, _ packed: Bool) async {
        let before = list.items.first { $0.id == itemId }
        list = list.withPacked(itemId: itemId, packed: packed, at: ISO8601DateFormatter().string(from: Date()))
        notice = nil
        guard let api, let trip else { return }
        pending.insert(itemId)
        defer { pending.remove(itemId) }
        do {
            let r = try await api.setPacked(orgId: trip.organizationId, tripId: trip.tripId, itemId: itemId, packed: packed, correlationId: nil)
            if let item = (r as? ApiResultOk<MyPackingItemDto>)?.value {
                list = list.replaceItem(item: PackingItem(id: item.id, name: item.name, note: item.note, packed: item.packed, packedAt: item.packedAt))
            } else if let failed = r as? ApiResultFailed {
                if let before { list = list.replaceItem(item: before) }
                notice = tr1(.packTickFailed, failed.error.code)
            } else {
                if let before { list = list.replaceItem(item: before).withOffline(offline: true) }
                notice = tr(.packTickOffline)
            }
        } catch {
            if let before { list = list.replaceItem(item: before).withOffline(offline: true) }
            notice = tr(.packTickOffline)
        }
    }
}

struct PackingView: View {
    @ObservedObject var model: PackingModel

    var body: some View {
        List {
            Section {
                VStack(alignment: .leading, spacing: 6) {
                    Text(tr(.packEyebrow).uppercased()).font(.caption).foregroundStyle(.secondary)
                    Text(model.list.whose()).font(.title2.bold())
                    HStack(spacing: 8) {
                        Text(model.list.summary()).font(.subheadline).foregroundStyle(.secondary)
                        Spacer()
                        statusChip
                    }
                    ProgressView(value: Double(model.list.packedCount()), total: Double(max(model.list.items.count, 1)))
                        .tint(Color(argb: Tokens.Color.Light.action))
                    if let error = model.error { Text(error).font(.caption).foregroundStyle(Color(argb: Tokens.Color.Light.danger)) }
                    if let notice = model.notice { Text(notice).font(.caption).foregroundStyle(Color(argb: Tokens.Color.Light.warning)) }
                    Text(tr(.packHint)).font(.caption).foregroundStyle(.secondary)
                }
            }
            Section {
                if model.list.items.isEmpty && !model.syncing {
                    Text(tr(.packNone)).font(.subheadline).foregroundStyle(.secondary)
                }
                ForEach(model.list.items, id: \.id) { item in
                    Button {
                        Task { await model.setPacked(item.id, !item.packed) }
                    } label: {
                        HStack(alignment: .center, spacing: 12) {
                            Image(systemName: item.packed ? "checkmark.circle.fill" : "circle")
                                .font(.title3)
                                .foregroundStyle(item.packed ? Color(argb: Tokens.Color.Light.success) : .secondary)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(item.name).font(.body.weight(.semibold)).strikethrough(item.packed)
                                    .foregroundStyle(item.packed ? .secondary : .primary)
                                if !item.note.isEmpty { Text(item.note).font(.caption).foregroundStyle(.secondary) }
                            }
                            Spacer()
                        }
                    }
                    .buttonStyle(.plain)
                    .disabled(model.pending.contains(item.id))
                    .accessibilityLabel(item.packed ? tr1(.packPackedSpoken, item.name) : tr1(.packUnpackedSpoken, item.name))
                }
            }
        }
        .navigationTitle(tr(.packTitle))
        .task { if model.live { await model.refresh() } }
    }

    /// "Live" / "Syncing" with the API; "Sample data" on the fixture, as on Android.
    private var statusChip: some View {
        let (label, color): (String, UInt32) = model.live
            ? (model.syncing ? (tr(.commonSyncing), Tokens.Color.Light.warning) : (tr(.commonLive), Tokens.Color.Light.success))
            : (tr(.commonSampleData), Tokens.Color.Light.pending)
        return Text(label).font(.caption2.weight(.semibold))
            .foregroundStyle(Color(argb: color))
            .voyChip(tint: Color(argb: color))
    }
}
