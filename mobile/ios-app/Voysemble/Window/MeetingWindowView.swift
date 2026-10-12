// Copyright 2026- At Day. All rights reserved.
// Meeting window (atlas #7, D15). Schematic zone drawn with Canvas; no map tiles, no coordinates.
// Mirrors MeetingWindowScreen on Android. Live (slice 029): the current window from the API, the
// traveler's switch judges one fix on the device (core rule) and sends only the state; while
// sharing, the state is re-judged on a timer so the server never reads it as stale.

import SwiftUI
import VoysembleCore

/// The platform's one-shot fix (CoreLocation in the app, a stub in tests). Nil without permission or a fix.
protocol DeviceLocationSource {
    func fix() async -> LocationFix?
}

@MainActor
final class MeetingWindowModel: ObservableObject {
    /// Nil when no window is open or scheduled for this trip.
    @Published private(set) var window: MeetingWindow?
    @Published private(set) var syncing = false
    @Published private(set) var error: String?
    let api: ApiClient?
    let trip: ActiveTrip?
    var live: Bool { api != nil && trip != nil }
    private let fixedNow: String
    private let locationSource: DeviceLocationSource?
    /// The wire window behind the screen model: the meeting point and the id live here, never in the view.
    private var current: MeetingWindowDto?
    /// Re-judge and refresh cadence while the screen is on; tests never reach it.
    static let tickSeconds: Double = 60
    /// A leader on a trip may open a window here and close the current one (slice 032).
    let canOpen: Bool
    /// The leader's own group, prefilled in the open form (from the roster, once).
    @Published private(set) var ownGroup: String?
    @Published private(set) var opening = false
    private var groupKnown = false

    var now: String { live ? Clocks.now() : fixedNow }

    /// Live with the client and the active trip: the window from the API. Without a trip: the
    /// fixture with a fixed clock (`window: nil` shows the empty state in sample mode).
    init(
        window: MeetingWindow? = KoreaConcertTourFixture.shared.meetingWindow(),
        now: String = "10:52",
        api: ApiClient? = nil,
        trip: ActiveTrip? = nil,
        locationSource: DeviceLocationSource? = nil,
        canOpen: Bool? = nil
    ) {
        self.api = api
        self.trip = trip
        self.locationSource = locationSource
        self.fixedNow = now
        self.window = (api != nil && trip != nil) ? nil : window
        self.canOpen = canOpen ?? (api != nil && trip?.role == "leader")
    }

    func refresh() async {
        guard let api, let trip else { return }
        syncing = true
        error = nil
        defer { syncing = false }
        do {
            let r = try await api.listWindows(orgId: trip.organizationId, tripId: trip.tripId, correlationId: nil)
            if let list = (r as? ApiResultOk<WindowListDto>)?.value {
                let dto = WindowRulesKt.currentWindowOf(windows: list.windows)
                current = dto
                window = dto?.toMeetingWindow(selfId: trip.participationId, clock: { iso in Clocks.localTime(iso) })
                if canOpen && !groupKnown { await loadOwnGroup(api, trip) }
            } else if let failed = r as? ApiResultFailed {
                error = failed.status == 403 ? "Guardians do not take part in meeting windows." : "Could not load the meeting window (\(failed.error.code))."
            } else {
                error = "Offline. The window needs one connection."
            }
        } catch {
            self.error = "Offline. The window needs one connection."
        }
    }

    /// The screen's lifetime: one refresh, then the tick (re-report while sharing, refresh) until the view goes.
    func run() async {
        await refresh()
        guard live else { return }
        while !Task.isCancelled {
            try? await Task.sleep(for: .seconds(Self.tickSeconds))
            if Task.isCancelled { return }
            if window?.selfOptedIn == true { await report() }
            await refresh()
        }
    }

    private func loadOwnGroup(_ api: ApiClient, _ trip: ActiveTrip) async {
        let r = try? await api.listRoster(orgId: trip.organizationId, tripId: trip.tripId, correlationId: nil)
        if let roster = (r as? ApiResultOk<RosterResponseDto>)?.value {
            groupKnown = true
            ownGroup = roster.participations.first { $0.id == trip.participationId }?.groupName
        }
    }

    /// A leader opens a window here and now (slice 032, D15): the phone's fix is the meeting
    /// point, the window starts now and lasts `minutes`. Without a fix nothing is sent.
    func openWindow(label: String, place: String, radiusMeters: Int, minutes: Int, groups: [String]) async {
        guard let api, let trip else { return }
        opening = true
        error = nil
        defer { opening = false }
        guard let fix = await locationSource?.fix() else {
            error = "Could not read this phone's position. Stand at the meeting point and allow location."
            return
        }
        let start = Date()
        let f = ISO8601DateFormatter()
        let body = OpenWindowRequestDto(
            label: label.trimmingCharacters(in: .whitespaces).isEmpty ? "Regroup" : label.trimmingCharacters(in: .whitespaces),
            place: place.trimmingCharacters(in: .whitespaces).isEmpty ? "Meeting point" : place.trimmingCharacters(in: .whitespaces),
            radiusMeters: Int32(min(max(radiusMeters, 25), 2000)),
            startsAt: f.string(from: start),
            endsAt: f.string(from: start.addingTimeInterval(Double(min(max(minutes, 5), 240)) * 60)),
            groups: groups.map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty },
            center: GeoPointDto(lat: fix.lat, lng: fix.lng),
        )
        do {
            let r = try await api.openWindow(orgId: trip.organizationId, tripId: trip.tripId, body: body, correlationId: nil)
            if let dto = (r as? ApiResultOk<MeetingWindowDto>)?.value {
                current = dto
                window = dto.toMeetingWindow(selfId: trip.participationId, clock: { iso in Clocks.localTime(iso) })
            } else if let failed = r as? ApiResultFailed {
                error = failed.status == 403 ? "Only trip leaders open windows." : "The server refused the window (\(failed.error.code))."
            } else {
                error = "Offline. A window needs one connection to open."
            }
        } catch {
            self.error = "Offline. A window needs one connection to open."
        }
    }

    /// A leader closes the current window early; the server erases the meeting point.
    func closeWindow() async {
        guard let api, let trip, let dto = current else { return }
        do {
            let r = try await api.closeWindow(orgId: trip.organizationId, tripId: trip.tripId, windowId: dto.id, correlationId: nil)
            if r is ApiResultOk<MeetingWindowDto> { await refresh() } else { error = "Could not close the window." }
        } catch {
            self.error = "Offline. The window closes itself at its end time."
        }
    }

    /// The traveler's switch: local first (the fixture rule), then one report in live mode.
    func setSharing(_ on: Bool) {
        if let w = window { window = on ? w.optIn() : w.optOut() }
        guard live else { return }
        Task { if on { await report() } else { await send("opted_out") } }
    }

    /// Judge the device's fix now and send the state; uncertain without permission or a fix. A coordinate never leaves the phone.
    func report() async {
        guard let dto = current else { return }
        let fix = await locationSource?.fix()
        await send(WindowRulesKt.judgeWindowStateFor(fix: fix, window: dto))
    }

    private func send(_ state: String) async {
        guard let api, let trip, let dto = current else { return }
        do {
            let r = try await api.reportWindowState(orgId: trip.organizationId, tripId: trip.tripId, windowId: dto.id, state: state, correlationId: nil)
            if let ok = (r as? ApiResultOk<ReportWindowStateResponseDto>)?.value {
                window = window?.withSelfState(state: WindowRulesKt.windowStateOf(wire: ok.state))
                error = nil
            } else if let failed = r as? ApiResultFailed {
                error = failed.status == 409 ? "This window has ended." : "The server refused the report (\(failed.error.code))."
            } else {
                error = "Offline. Your state was not sent."
            }
        } catch {
            self.error = "Offline. Your state was not sent."
        }
    }
}

struct MeetingWindowView: View {
    @ObservedObject var model: MeetingWindowModel

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                Text("MEETING WINDOW").font(.caption).foregroundStyle(.secondary)
                if let w = model.window {
                    openWindow(w)
                } else {
                    noWindow
                }
            }
            .padding()
        }
        .task { await model.run() }
    }

    /// "Live" / "Syncing" with the API; "Sample data" on the fixture, as on Android.
    private var statusChip: some View {
        Text(model.live ? (model.syncing ? "Syncing" : "Live") : "Sample data")
            .font(.caption2.weight(.semibold)).foregroundStyle(.secondary)
    }

    private var noWindow: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("No window open").font(.largeTitle.bold())
                Spacer()
                statusChip
            }
            if let error = model.error { Text(error).font(.caption).foregroundStyle(.red) }
            Text("No meeting window is open right now.").font(.headline)
            Text(model.canOpen
                ? "Open one here: this phone's position becomes the meeting point. Travelers opt in per window; leaders see inside or outside, never a track."
                : "When a leader opens one, it appears here with its time range and zone. Sharing is per window, only while it is open, and stops automatically.")
                .font(.subheadline).foregroundStyle(.secondary)
            if model.canOpen { OpenWindowForm(model: model) }
        }
    }

    @ViewBuilder
    private func openWindow(_ w: MeetingWindow) -> some View {
        let now = model.now
        let open = w.isOpenAt(now: now)
        HStack {
            Text(w.label).font(.largeTitle.bold())
            Spacer()
            statusChip
        }
        Text("\(w.place) · \(w.radiusMeters) m zone · \(w.startsAt)–\(w.endsAt)").font(.subheadline).foregroundStyle(.secondary)
        Label(open ? "Open · \(w.minutesLeftAt(now: now)) min left" : "Closed", systemImage: "clock")
            .font(.caption).foregroundStyle(open ? .green : .secondary)
        if let error = model.error { Text(error).font(.caption).foregroundStyle(.red) }
        if model.canOpen && open {
            Button("Close window now") { Task { await model.closeWindow() } }.buttonStyle(.bordered)
        }
        Canvas { ctx, size in
            let center = CGPoint(x: size.width / 2, y: size.height / 2)
            let r = min(size.width, size.height) * 0.36
            let zone = Path(ellipseIn: CGRect(x: center.x - r, y: center.y - r, width: 2 * r, height: 2 * r))
            ctx.fill(zone, with: .color(.blue.opacity(0.12)))
            ctx.stroke(zone, with: .color(.blue), lineWidth: 2)
            for m in w.members where m.state != .optedOut {
                let p = CGPoint(x: center.x + CGFloat(m.dx) * r * 0.9, y: center.y + CGFloat(m.dy) * r * 0.9)
                let dot = Path(ellipseIn: CGRect(x: p.x - 8, y: p.y - 8, width: 16, height: 16))
                ctx.fill(dot, with: .color(color(for: m.state)))
            }
        }
        .frame(height: 260)
        .background(Color.secondary.opacity(0.08))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        HStack(spacing: 12) {
            ForEach([WindowState.inside, .outside, .uncertain, .stale, .optedOut], id: \.self) { s in
                HStack(spacing: 4) {
                    Circle().fill(color(for: s)).frame(width: 10, height: 10)
                    Text("\(label(for: s)) \(w.count(state: s))").font(.caption)
                }
            }
        }
        if w.selfId != nil, w.me != nil {
            Toggle(isOn: Binding(get: { w.selfOptedIn }, set: { model.setSharing($0) })) {
                VStack(alignment: .leading) {
                    Text("Share my position for this window").font(.headline)
                    Text(w.selfOptedIn ? "Sharing with leaders until \(w.endsAt). Stops automatically." : "Only while this window is open. Leaders see inside/outside, never a track. Guardians never see it.")
                        .font(.subheadline).foregroundStyle(.secondary)
                }
            }
            .disabled(!open)
            if let me = w.me {
                HStack(spacing: 6) {
                    Text("Your state:").font(.caption).foregroundStyle(.secondary)
                    Text(label(for: me.state)).font(.caption.bold()).foregroundStyle(color(for: me.state))
                }
            }
        }
    }

    private func color(for s: WindowState) -> Color {
        switch s {
        case .inside: return .green
        case .outside: return .red
        case .uncertain: return .orange
        case .stale: return .gray
        case .optedOut: return .secondary
        }
    }

    private func label(for s: WindowState) -> String {
        switch s {
        case .inside: return "Inside"
        case .outside: return "Outside"
        case .uncertain: return "Uncertain"
        case .stale: return "Stale"
        case .optedOut: return "Not sharing"
        }
    }
}

/// The leader's form (slice 032): label, place, radius, duration, groups; the point is the phone's fix.
private struct OpenWindowForm: View {
    @ObservedObject var model: MeetingWindowModel
    @State private var label = "Regroup"
    @State private var place = ""
    @State private var radius = "200"
    @State private var minutes = "30"
    @State private var groups = ""
    @State private var seeded = false

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("OPEN A WINDOW HERE").font(.caption).foregroundStyle(.secondary)
            TextField("Label", text: $label).textFieldStyle(.roundedBorder)
            TextField("Place", text: $place).textFieldStyle(.roundedBorder)
            HStack {
                TextField("Radius (m)", text: $radius).textFieldStyle(.roundedBorder).keyboardType(.numberPad)
                TextField("Minutes", text: $minutes).textFieldStyle(.roundedBorder).keyboardType(.numberPad)
            }
            TextField("Groups (comma separated; empty = everyone)", text: $groups).textFieldStyle(.roundedBorder)
            Button(model.opening ? "Opening…" : "Open window here") {
                Task {
                    await model.openWindow(
                        label: label, place: place, radiusMeters: Int(radius) ?? 200, minutes: Int(minutes) ?? 30,
                        groups: groups.split(separator: ",").map(String.init),
                    )
                }
            }
            .buttonStyle(.borderedProminent).disabled(model.opening)
            Text("Uses this phone's position once as the meeting point. Stand where the group should gather.")
                .font(.caption).foregroundStyle(.secondary)
        }
        .padding(12)
        .background(RoundedRectangle(cornerRadius: 12).fill(Color.secondary.opacity(0.08)))
        .onChange(of: model.ownGroup) { _, g in if !seeded, let g { groups = g; seeded = true } }
        .onAppear { if !seeded, let g = model.ownGroup { groups = g; seeded = true } }
    }
}

