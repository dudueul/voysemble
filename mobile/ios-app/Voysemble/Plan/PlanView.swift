// Copyright 2026- At Day. All rights reserved.
// Plan tab (slice 035). Mirrors PlanScreen on Android; rules in core (plan/PlanModel.kt). Live
// with a client and a trip: the published itinerary as a day-by-day plan, the device date's day
// opened first, and a leader's proposals (change, remove, add) through core. Without a trip: the
// fixture plan on its own day. The phone never edits the itinerary (D24). A leader also reads
// the trip's bookings under each day (slice 047, D37; core travel/TravelModel.kt): the flights
// that touch the day, the hotel of the night, every bus with its roster seats; never the
// driver's contact.

import SwiftUI
import VoysembleCore

@MainActor
final class PlanModel: ObservableObject {
    @Published private(set) var plan: TripPlan
    /// Index into `plan.days`; 0 on an empty plan.
    @Published var selected = 0
    @Published private(set) var syncing = false
    @Published private(set) var error: String?
    @Published private(set) var proposal: ProposalState?
    /// The trip's bookings once loaded; nil before the first answer and for roles that never ask.
    @Published private(set) var travel: TripTravel?
    let api: ApiClient?
    let trip: ActiveTrip?
    /// D24: leaders propose; travelers and guardians only read. Sample mode shows the affordance.
    let canPropose: Bool
    /// D37: leaders read the bookings; travelers and guardians never ask. Sample mode shows them.
    let canSeeTravel: Bool
    var live: Bool { api != nil && trip != nil }
    private let deviceDate: (String) -> String
    /// Slice 087: the last itinerary of the active trip, read at start and kept after every answer.
    private let pack: OfflinePack?

    init(
        plan: TripPlan? = nil,
        api: ApiClient? = nil,
        trip: ActiveTrip? = nil,
        deviceDate: @escaping (String) -> String = { zone in Clocks.date(in: zone) },
        canPropose: Bool? = nil,
        pack: OfflinePack? = nil
    ) {
        self.api = api
        self.trip = trip
        self.pack = pack
        self.deviceDate = deviceDate
        self.canPropose = canPropose ?? (trip == nil || trip?.role == "leader")
        self.canSeeTravel = trip == nil || trip?.role == "leader"
        let now = Int64(Date().timeIntervalSince1970 * 1000)
        if let plan {
            self.plan = plan
        } else if let trip, api != nil, let packed = pack?.load(tripId: trip.tripId, nowMillis: now) {
            // Slice 087: the plan as last synced, opened on the device date's day.
            let packedPlan = PlanModelKt.planOf(itinerary: packed.itinerary, offline: false, minutesSinceSync: KotlinInt(int: OfflinePackKt.packAgeMinutes(savedAtMillis: packed.savedAtMillis, nowMillis: now)))
            self.plan = packedPlan
            selected = Int(packedPlan.initialDayIndex(date: deviceDate(packedPlan.days.first?.timeZone ?? "UTC")))
        } else if let trip, api != nil {
            self.plan = PlanModelKt.emptyTripPlan(tripName: trip.tripName)
        } else {
            self.plan = KoreaConcertTourFixture.shared.plan()
        }
        // Sample mode opens the fixture's own day (KoreaConcertTourFixture.TODAY_DATE) with the fixture bookings.
        if api == nil || trip == nil {
            selected = Int(self.plan.initialDayIndex(date: "2026-12-31"))
            if canSeeTravel { travel = KoreaConcertTourFixture.shared.travel() }
        }
    }

    func refresh() async {
        guard let api, let trip else { return }
        syncing = true
        defer { syncing = false }
        do {
            let r = try await api.getItinerary(orgId: trip.organizationId, tripId: trip.tripId, correlationId: nil)
            if let itinerary = (r as? ApiResultOk<ItineraryDto>)?.value {
                pack?.save(tripId: trip.tripId, itinerary: itinerary, savedAtMillis: Int64(Date().timeIntervalSince1970 * 1000))
                let next = PlanModelKt.planOf(itinerary: itinerary, offline: false, minutesSinceSync: KotlinInt(int: 0))
                // Open the device date's day on the first answer; keep the reader's choice after.
                if plan.days.isEmpty {
                    selected = Int(next.initialDayIndex(date: deviceDate(next.days.first?.timeZone ?? "UTC")))
                } else {
                    selected = min(selected, max(next.days.count - 1, 0))
                }
                plan = next
                error = nil
            } else if let failed = r as? ApiResultFailed {
                error = tr1(.planLoadFailed, failed.error.code)
            } else {
                plan = plan.withOffline(offline: true)
            }
        } catch {
            plan = plan.withOffline(offline: true)
        }
        if canSeeTravel { await loadTravel(api: api, trip: trip) }
    }

    /// The bookings after the itinerary (D37): a failure is said once, offline keeps the last answer.
    private func loadTravel(api: ApiClient, trip: ActiveTrip) async {
        do {
            let r = try await api.travelPlan(orgId: trip.organizationId, tripId: trip.tripId, correlationId: nil)
            if let dto = (r as? ApiResultOk<TravelPlanDto>)?.value {
                travel = TravelModelKt.travelOf(dto: dto)
            } else if let failed = r as? ApiResultFailed {
                if error == nil { error = tr1(.travelLoadFailed, failed.error.code) }
            } else {
                travel = travel?.withOffline(offline: true)
            }
        } catch {
            travel = travel?.withOffline(offline: true)
        }
    }

    /// Same contract as TodayModel.propose: sample mode shows "sent", a bad draft says why.
    func propose(_ draft: ProposalDraft) async {
        let eventId = draft.eventId ?? ""
        guard let api, let trip else {
            proposal = ProposalState(eventId: eventId, sending: false, sent: true, error: nil, kind: draft.kind)
            return
        }
        if let problem = ProposalDraftKt.proposalDraftProblem(d: draft) {
            proposal = ProposalState(eventId: eventId, sending: false, sent: false, error: problem, kind: draft.kind)
            return
        }
        proposal = ProposalState(eventId: eventId, sending: true, sent: false, error: nil, kind: draft.kind)
        proposal = await sendProposal(api: api, trip: trip, draft: draft)
    }

    func dismissProposal() { proposal = nil }
}

struct PlanView: View {
    @ObservedObject var model: PlanModel
    @State private var proposing: ProposalTarget?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                header
                if let error = model.error { Text(error).font(.caption).foregroundStyle(Color(argb: Tokens.Color.Light.danger)) }
                if model.plan.offline { offlineBanner }
                if model.plan.days.isEmpty {
                    Text(model.live && model.syncing ? tr(.planLoading) : tr(.planNone))
                        .font(.subheadline).foregroundStyle(.secondary)
                } else {
                    dayChips
                }
                if model.selected < model.plan.days.count {
                    dayView(model.plan.days[model.selected])
                }
            }
            .padding(16)
        }
        .background(Color(argb: Tokens.Color.Light.bg))
        .task { await model.refresh() }
        .sheet(item: $proposing) { target in
            ProposeChangeSheet(
                target: target,
                onSend: { draft in
                    proposing = nil
                    Task { await model.propose(draft) }
                },
                onCancel: { proposing = nil },
            )
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(model.plan.tripName.uppercased()).font(.caption2.weight(.semibold)).foregroundStyle(.secondary)
            HStack {
                Text(tr(.planTitle)).font(.largeTitle.bold())
                Spacer()
                statusChip
            }
            Text(model.plan.revisionLine() + syncText(model.plan.minutesSinceSync)).font(.subheadline).foregroundStyle(.secondary)
        }
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

    private func syncText(_ minutes: KotlinInt?) -> String {
        guard let m = minutes?.intValue else { return "" }
        return " · " + (m == 0 ? tr(.commonSyncedJustNow) : tr1(.commonSyncedMinAgo, m))
    }

    private var offlineBanner: some View {
        HStack(spacing: 8) {
            Image(systemName: "wifi.slash")
            Text(tr(.commonOfflineLastPlan))
        }
        .font(.subheadline.weight(.semibold))
        .foregroundStyle(Color(argb: Tokens.Color.Light.warning))
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 12).fill(Color(argb: Tokens.Color.Light.warning).opacity(0.14)))
    }

    /// D32: the day pills are one glass group on iOS 26 (interactive, the chosen day tinted); flat capsules before.
    private var dayChips: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            VoyGlassGroup {
                HStack(spacing: 8) {
                    ForEach(Array(model.plan.days.enumerated()), id: \.element.date) { i, day in
                        let on = i == model.selected
                        Button { model.selected = i } label: {
                            Text(tr2(.planDayChip, day.dayNumber, day.label))
                                .font(.subheadline.weight(.semibold))
                                .voyPill(selected: on, tint: Color(argb: Tokens.Color.Light.action))
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(tr2(.planOpenDaySpoken, day.label, day.dateLabel))
                    }
                }
            }
        }
    }

    @ViewBuilder
    private func dayView(_ day: PlanDay) -> some View {
        HStack(alignment: .center) {
            VStack(alignment: .leading, spacing: 2) {
                Text(day.label).font(.title3.bold())
                Text(tr3(.planDayMeta, day.dateLabel, day.timeZoneLabel, day.dayNumber)).font(.subheadline).foregroundStyle(.secondary)
            }
            Spacer()
            // The add affordance sits in the day header so a long day never hides it, as on Android.
            if model.canPropose {
                Button(tr(.planProposeEvent)) { proposing = ProposalTarget.forDay(day) }
                    .voyButton()
                    .disabled(model.proposal?.sending == true)
            }
        }
        if let p = model.proposal { proposalLine(p) }
        if day.events.isEmpty {
            Text(tr(.planNothing)).font(.subheadline).foregroundStyle(.secondary)
        }
        ForEach(day.events, id: \.id) { e in
            VStack(alignment: .leading, spacing: 0) {
                EventRow(event: e)
                if model.canPropose {
                    Button(tr(.todayProposeChange)) {
                        proposing = ProposalTarget.forEvent(e, dayLabel: day.label, date: day.date, timeZone: day.timeZone)
                    }
                    .font(.subheadline.weight(.semibold))
                    .disabled(model.proposal?.sending == true)
                    .accessibilityLabel(tr1(.planProposeChangeSpoken, e.title))
                }
            }
        }
        if let travel = model.travel { bookings(travel.bookingsOn(date: day.date)) }
    }

    /// The day's bookings (D37): flights, the hotel of the night, every bus; as on Android.
    @ViewBuilder
    private func bookings(_ onDay: DayTravel) -> some View {
        Text(tr(.travelSection).uppercased()).font(.caption2.weight(.semibold)).foregroundStyle(.secondary).padding(.top, 8)
        Text(tr(.travelHint)).font(.caption).foregroundStyle(.secondary)
        if onDay.isQuiet() { Text(tr(.travelQuiet)).font(.subheadline).foregroundStyle(.secondary) }
        ForEach(onDay.flights, id: \.id) { f in
            BookingRow(symbol: "airplane", title: f.title(), detail: f.detail(), spoken: tr1(.travelFlightSpoken, f.code), status: f.status)
        }
        ForEach(onDay.hotels, id: \.hotel.id) { h in
            BookingRow(symbol: "bed.double", title: h.hotel.name, detail: h.detail(), spoken: tr1(.travelHotelSpoken, h.hotel.name), status: nil)
            // Slice 059 (D41): the leader reads who sleeps where.
            NavigationLink(tr(.roomingOpen)) { RoomingDestination(api: model.api, trip: model.trip, hotel: h.hotel) }
                .font(.subheadline.weight(.semibold))
                .accessibilityLabel(tr1(.roomingOpenSpoken, h.hotel.name))
        }
        ForEach(onDay.buses, id: \.id) { b in
            BookingRow(symbol: "bus", title: b.label, detail: b.detail(), spoken: tr1(.travelBusSpoken, b.label), status: nil)
        }
    }

    /// The result of the last proposal, with OK to clear it.
    private func proposalLine(_ p: ProposalState) -> some View {
        HStack(spacing: 8) {
            Text(p.sending ? tr(.todaySendingProposal) : p.sent ? ProposalDraftKt.proposalSentMessage(kind: p.kind) : (p.error ?? tr(.proposalFailedGeneric)))
                .font(.subheadline)
                .foregroundStyle(Color(argb: p.sent || p.sending ? Tokens.Color.Light.success : Tokens.Color.Light.warning))
            Spacer()
            if !p.sending { Button(tr(.commonOk)) { model.dismissProposal() }.font(.subheadline.weight(.semibold)) }
        }
    }
}

/// One booking: an icon, a title, the detail line and, for a flight, its status chip.
struct BookingRow: View {
    let symbol: String
    let title: String
    let detail: String
    let spoken: String
    let status: String?

    var body: some View {
        HStack(alignment: .center, spacing: 12) {
            Image(systemName: symbol)
                .frame(width: 36, height: 36)
                .background(RoundedRectangle(cornerRadius: 10).stroke(Color(argb: Tokens.Color.Light.border)))
                .foregroundStyle(.secondary)
                .accessibilityLabel(spoken)
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.body.weight(.semibold))
                Text(detail).font(.subheadline).foregroundStyle(.secondary)
            }
            Spacer()
            if let status {
                Text(TravelModelKt.flightStatusLabel(status: status))
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(Color(argb: tint(status)))
                    .voyChip(tint: Color(argb: tint(status)))
            }
        }
        .padding(.vertical, 6)
    }

    private func tint(_ status: String) -> UInt32 {
        switch status {
        case "delayed": return Tokens.Color.Light.warning
        case "cancelled": return Tokens.Color.Light.danger
        case "done": return Tokens.Color.Light.success
        default: return Tokens.Color.Light.pending
        }
    }
}
