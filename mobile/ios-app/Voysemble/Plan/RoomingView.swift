// Copyright 2026- At Day. All rights reserved.
// Rooming list (D41, slice 059). Mirrors RoomingScreen on Android; rules in core
// (travel/RoomingModel.kt). Live with a client, a trip and a hotel booking: the list from the API,
// read-only (a failure is said; offline keeps the last answer). Without a trip: the fixture list.
// Reached from a hotel row on the Plan tab by a leader.

import SwiftUI
import VoysembleCore

@MainActor
final class RoomingModel: ObservableObject {
    @Published private(set) var rooming: Rooming
    @Published private(set) var syncing = false
    @Published private(set) var error: String?
    let api: ApiClient?
    let trip: ActiveTrip?
    let bookingId: String?
    var live: Bool { api != nil && trip != nil && bookingId != nil }

    init(rooming: Rooming? = nil, api: ApiClient? = nil, trip: ActiveTrip? = nil, bookingId: String? = nil, hotelName: String = "") {
        self.api = api
        self.trip = trip
        self.bookingId = bookingId
        if let rooming {
            self.rooming = rooming
        } else if trip != nil, api != nil, bookingId != nil {
            self.rooming = RoomingModelKt.emptyRooming(hotelName: hotelName)
        } else {
            self.rooming = KoreaConcertTourFixture.shared.rooming()
        }
    }

    func refresh() async {
        guard let api, let trip, let bookingId else { return }
        syncing = true
        defer { syncing = false }
        do {
            let r = try await api.rooming(orgId: trip.organizationId, tripId: trip.tripId, bookingId: bookingId, correlationId: nil)
            if let dto = (r as? ApiResultOk<RoomingListDto>)?.value {
                rooming = RoomingModelKt.roomingOf(dto: dto)
                error = nil
            } else if let failed = r as? ApiResultFailed {
                error = tr1(.roomingLoadFailed, failed.error.code)
            } else {
                rooming = rooming.withOffline(offline: true)
                error = tr(.roomingOffline)
            }
        } catch {
            rooming = rooming.withOffline(offline: true)
            self.error = tr(.roomingOffline)
        }
    }
}

struct RoomingView: View {
    @ObservedObject var model: RoomingModel

    var body: some View {
        let rooms = model.rooming.byRoom()
        let leaders = Set(model.rooming.people.filter { $0.leader }.map { $0.name })
        let unassigned = model.rooming.unassigned()
        List {
            Section {
                VStack(alignment: .leading, spacing: 6) {
                    Text(tr(.roomingEyebrow).uppercased()).font(.caption).foregroundStyle(.secondary)
                    Text(model.rooming.hotelName).font(.title2.bold())
                    HStack(spacing: 8) {
                        Text(model.rooming.summary()).font(.subheadline).foregroundStyle(.secondary)
                        Spacer()
                        statusChip
                    }
                    if let error = model.error { Text(error).font(.caption).foregroundStyle(Color(argb: Tokens.Color.Light.danger)) }
                    Text(tr(.roomingHint)).font(.caption).foregroundStyle(.secondary)
                }
            }
            if rooms.isEmpty && !model.syncing {
                Section { Text(tr(.roomingNone)).font(.subheadline).foregroundStyle(.secondary) }
            }
            ForEach(rooms, id: \.room) { room in
                Section(RoomingModelKt.roomLabel(room: room.room)) {
                    ForEach(room.names, id: \.self) { name in
                        Text(name)
                            .font(leaders.contains(name) ? .body.weight(.semibold) : .body)
                            .foregroundStyle(leaders.contains(name) ? .primary : .secondary)
                    }
                }
            }
            if !unassigned.isEmpty {
                Section(tr(.roomingUnassigned)) {
                    ForEach(unassigned, id: \.self) { name in
                        Text(name).accessibilityLabel(tr1(.roomingPersonUnassignedSpoken, name))
                    }
                }
            }
        }
        .navigationTitle(tr(.roomingTitle))
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

/// The pushed destination from a hotel row: its own model, live on a trip, the fixture otherwise.
struct RoomingDestination: View {
    @StateObject private var model: RoomingModel

    init(api: ApiClient?, trip: ActiveTrip?, hotel: Hotel) {
        _model = StateObject(wrappedValue: RoomingModel(api: api, trip: trip, bookingId: trip == nil ? nil : hotel.id, hotelName: hotel.name))
    }

    var body: some View { RoomingView(model: model) }
}
