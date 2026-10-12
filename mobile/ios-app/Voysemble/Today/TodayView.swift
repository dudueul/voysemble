// Copyright 2026- At Day. All rights reserved.
//
// Mobile Today screen (SwiftUI). Same structure as the Compose screen: header with day + sync,
// green "Up next" card, latest announcement with acknowledgment, head count, later-today list,
// five tabs. Status is never color-only.

import SwiftUI
import VoysembleCore

struct TodayView: View {
    @StateObject var model: TodayModel
    // The tab and leader screens share the Today model's client and trip (live) or none (sample).
    @StateObject private var bulletin: BulletinModel
    @StateObject private var headcount: HeadcountModel
    @StateObject private var incidents: IncidentsModel
    @StateObject private var window: MeetingWindowModel
    @StateObject private var chats: ChatsModel
    // Slice 035: the Plan tab shares the same client and trip.
    @StateObject private var plan: PlanModel
    @State private var proposing: ProposalTarget?

    init(model: TodayModel) {
        _model = StateObject(wrappedValue: model)
        _bulletin = StateObject(wrappedValue: BulletinModel(api: model.api, trip: model.trip))
        _headcount = StateObject(wrappedValue: HeadcountModel(api: model.api, trip: model.trip))
        _incidents = StateObject(wrappedValue: IncidentsModel(api: model.api, trip: model.trip))
        // Slice 029: the window reads the API and judges the device's fix in core; sample mode has no fix.
        _window = StateObject(wrappedValue: MeetingWindowModel(
            api: model.api, trip: model.trip, locationSource: model.trip == nil ? nil : CoreLocationSource()))
        // Slice 033 (D22): fixed chat channels; live when signed in on a trip, the fixture otherwise.
        _chats = StateObject(wrappedValue: ChatsModel(api: model.api, trip: model.trip))
        _plan = StateObject(wrappedValue: PlanModel(api: model.api, trip: model.trip))
    }

    var body: some View {
        TabView(selection: $model.tab) {
            todayTab.tabItem { Label(tr(.tabToday), systemImage: "calendar") }.tag(MainTab.today)
            NavigationStack { PlanView(model: plan) }
                .tabItem { Label(tr(.tabPlan), systemImage: "list.bullet.rectangle") }.tag(MainTab.plan)
            NavigationStack { BulletinView(model: bulletin) }
                .tabItem { Label(tr(.tabBulletin), systemImage: "bell") }.tag(MainTab.bulletin)
            NavigationStack { ChatsView(model: chats) }
                .tabItem { Label(tr(.tabChats), systemImage: "bubble.left") }.tag(MainTab.chats)
            placeholder(tr(.tabMemories)).tabItem { Label(tr(.tabMemories), systemImage: "photo.on.rectangle") }.tag(MainTab.memories)
        }
        .tint(Color(argb: Tokens.Color.Light.brand))
        .voyTabBarMinimizes()
        .task { await model.refresh() }
    }

    private var todayTab: some View {
        let s = model.snapshot
        return NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    header(s)
                    if s.offline { offlineBanner }
                    if let next = s.upNext {
                        // D24: leaders propose a change to the up-next event; the organizer decides on the console.
                        UpNextCard(
                            event: next, timeZone: s.timeZoneLabel, canPropose: model.canPropose,
                            proposal: model.proposal?.eventId == next.id ? model.proposal : nil,
                            onPropose: { proposing = ProposalTarget.forEvent(next) },
                            onDismiss: { model.dismissProposal() },
                        )
                    }
                    if let a = s.announcement { AnnouncementCard(announcement: a) { model.acknowledge($0) } }
                    if let g = model.guardian {
                        // D13: the guardian's card replaces the head count card and the leader links.
                        GuardianStatusCard(card: g)
                        // D27 (slice 032): the guardian writes the care note here; leaders reveal it at the count.
                        if model.careStatus != nil { GuardianCareCard(model: model) }
                    } else {
                        HeadcountCard(groups: s.headcount, checkedIn: Int(s.checkedIn), expected: Int(s.expected))
                        // Slice 009: leader and traveler screens reachable from Today, as on Android.
                        HStack {
                            NavigationLink(tr(.todayOpenHeadCount)) { HeadcountView(model: headcount) }
                            Spacer()
                            NavigationLink(tr(.todayMeetingWindow)) { MeetingWindowView(model: window) }
                            Spacer()
                            NavigationLink(tr(.todayIncidents)) { IncidentsView(model: incidents) }
                        }
                        .font(.subheadline.weight(.semibold))
                    }
                    Text(tr(.todayLater)).font(.headline).padding(.top, 4)
                    ForEach(s.later, id: \.id) { EventRow(event: $0) }
                }
                .padding(16)
            }
            .background(Color(argb: Tokens.Color.Light.bg))
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
    }

    private func header(_ s: TodaySnapshot) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(tr2(.todayEyebrow, s.tripName.uppercased(), s.dayNumber))
                .font(.caption2.weight(.semibold)).foregroundStyle(.secondary)
            HStack {
                Text(tr(.todayTitle)).font(.largeTitle.bold())
                Spacer()
                statusChip
            }
            if let error = model.error {
                Text(error).font(.caption).foregroundStyle(Color(argb: Tokens.Color.Light.danger))
            }
            HStack(spacing: 6) {
                Text("\(s.dateLabel) · \(s.timeZoneLabel)")
                Text("·")
                Image(systemName: "arrow.triangle.2.circlepath").foregroundStyle(Color(argb: Tokens.Color.Light.success))
                Text(syncText(s.minutesSinceSync))
            }
            .font(.subheadline).foregroundStyle(.secondary)
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
        guard let m = minutes?.intValue else { return tr(.commonNotSyncedYet) }
        return m == 0 ? tr(.commonSyncedJustNow) : tr1(.commonSyncedMinAgo, m)
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

    private func placeholder(_ name: String) -> some View {
        VStack(spacing: 8) {
            Text(tr1(.commonNotBuilt, name)).font(.headline)
            Text(tr(.commonNotBuiltStatus)).foregroundStyle(.secondary)
        }
    }
}

private struct UpNextCard: View {
    let event: TodayEvent
    let timeZone: String
    var canPropose = false
    var proposal: ProposalState? = nil
    var onPropose: () -> Void = {}
    var onDismiss: () -> Void = {}
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(tr(.todayUpNext)).font(.caption2.weight(.semibold)).opacity(0.8)
            Text(event.title).font(.title3.bold())
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(event.end.map { "\(event.start) – \($0)" } ?? event.start).font(.largeTitle.bold())
                Text(timeZone).font(.subheadline).opacity(0.8)
            }
            Label(event.place, systemImage: "mappin").font(.body)
            if let note = event.note { Text(note).font(.subheadline).opacity(0.85) }
            // D32: the buttons float over the colored card; glass on iOS 26, a translucent capsule before.
            VoyGlassGroup {
                HStack(spacing: 10) {
                    Button {
                    } label: {
                        Label(event.isMeetingPoint ? tr(.todayMeetingPoint) : tr(.todayDirections), systemImage: "map")
                    }
                    .voyOverlayButton()
                    if canPropose {
                        Button {
                            onPropose()
                        } label: {
                            Text(proposal?.sending == true ? tr(.todaySendingProposal)
                                : proposal?.sent == true ? ProposalDraftKt.proposalSentMessage(kind: proposal?.kind ?? ProposalKind.edit)
                                : tr(.todayProposeChange))
                                .font(.subheadline.weight(.semibold))
                        }
                        .voyOverlayButton()
                        .disabled(proposal?.sending == true)
                        if let p = proposal, !p.sending {
                            Button(tr(.commonOk)) { onDismiss() }.font(.subheadline.weight(.semibold)).voyOverlayButton()
                        }
                    }
                }
            }
            .padding(.top, 4)
            if canPropose, let error = proposal?.error { Text(error).font(.subheadline) }
        }
        .foregroundStyle(Color(argb: Tokens.Color.Light.onAction))
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 16).fill(Color(argb: Tokens.Color.Light.action)))
        .accessibilityElement(children: .combine)
        .accessibilityLabel(tr2(.todayUpNextA11y, event.title, event.start))
    }
}

private struct AnnouncementCard: View {
    let announcement: TodayAnnouncement
    let onAcknowledge: (String) -> Void
    var body: some View {
        Card {
            HStack {
                Text(tr(.todayLatestUpdate)).font(.caption2.weight(.semibold)).foregroundStyle(.secondary)
                Spacer()
                Text("\(announcement.author) · \(announcement.publishedAt)").font(.subheadline).foregroundStyle(.secondary)
            }
            Text(announcement.title).font(.headline).padding(.top, 6)
            Text(announcement.body).font(.body).foregroundStyle(.secondary).padding(.top, 2)
            HStack(spacing: 10) {
                switch announcement.ack {
                case .unacknowledged:
                    Button(tr(.todayAcknowledge)) { onAcknowledge(announcement.id) }
                        .buttonStyle(.borderedProminent)
                        .tint(Color(argb: Tokens.Color.Light.action))
                case .pending:
                    Label(tr(.todayQueued), systemImage: "clock").font(.subheadline.weight(.semibold)).foregroundStyle(.secondary)
                case .acknowledged:
                    Label(tr(.todayAcknowledged), systemImage: "checkmark").font(.subheadline.weight(.semibold)).foregroundStyle(.secondary)
                }
                Text(tr2(.todayAckCount, announcement.acknowledgedCount, announcement.totalCount)).font(.subheadline).foregroundStyle(.secondary)
            }
            .padding(.top, 10)
        }
    }
}

/// D13: status, never coordinates. Tone picks the colour; the words come from core.
private struct GuardianCareCard: View {
    @ObservedObject var model: TodayModel
    @State private var allergies = ""
    @State private var medications = ""
    @State private var freeText = ""

    var body: some View {
        let status = model.careStatus
        let onFile = status?.hasCareNote ?? false
        let reveals = Int(status?.reveals ?? 0)
        Card {
            HStack {
                Text(tr(.todayCareNote)).font(.caption2.weight(.semibold)).foregroundStyle(.secondary)
                Spacer()
                Text(onFile ? tr1(.todayCareOnFile, reveals) : tr(.todayCareNotOnFile)).font(.subheadline.weight(.semibold))
            }
            if let draft = model.careDraft {
                TextField(tr(.todayCareAllergies), text: $allergies).textFieldStyle(.roundedBorder)
                TextField(tr(.todayCareMedications), text: $medications).textFieldStyle(.roundedBorder)
                TextField(tr(.todayCareFreeText), text: $freeText, axis: .vertical).textFieldStyle(.roundedBorder)
                HStack {
                    Button(model.careSaving ? tr(.todayCareSaving) : tr(.todayCareSave)) {
                        Task { await model.saveCare(CareNoteDto(allergies: allergies, medications: medications, freeText: freeText)) }
                    }
                    .buttonStyle(.borderedProminent).disabled(model.careSaving)
                    Button(tr(.commonCancel)) { model.cancelCare() }.buttonStyle(.bordered).disabled(model.careSaving)
                }
                .onAppear {
                    allergies = draft.allergies
                    medications = draft.medications
                    freeText = draft.freeText
                }
            } else {
                Text(onFile
                    ? tr(.todayCareSealedIntro)
                    : tr(.todayCareAddIntro))
                    .font(.subheadline).foregroundStyle(.secondary).padding(.top, 4)
                Button(onFile ? tr(.todayCareEdit) : tr(.todayCareAdd)) { Task { await model.editCare() } }
                    .buttonStyle(.bordered).padding(.top, 6)
            }
            if let message = model.careMessage {
                Text(message).font(.subheadline).foregroundStyle(.secondary).padding(.top, 4)
            }
        }
    }
}

private struct GuardianStatusCard: View {
    let card: GuardianCard
    var body: some View {
        let tone: UInt32 = {
            switch card.tone {
            case .good: return Tokens.Color.Light.action
            case .attention: return Tokens.Color.Light.warning
            case .calm: return Tokens.Color.Light.textMuted
            }
        }()
        Card {
            HStack {
                Text(tr(.todayYourTraveler)).font(.caption2.weight(.semibold)).foregroundStyle(.secondary)
                Spacer()
                Text([card.travelerName, card.groupName].compactMap { $0 }.joined(separator: " · ")).font(.subheadline.weight(.semibold))
            }
            Text(card.headline).font(.headline).foregroundStyle(Color(argb: tone)).padding(.top, 6)
            Text(card.detail).font(.subheadline).foregroundStyle(.secondary).padding(.top, 2)
            if let balance = card.balance {
                Text(balance).font(.subheadline.weight(.semibold)).padding(.top, 4)
            }
            if let message = card.message {
                Text(message).font(.subheadline)
                    .padding(10)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(RoundedRectangle(cornerRadius: 10).fill(Color(argb: Tokens.Color.Light.action).opacity(0.1)))
                    .padding(.top, 8)
            }
        }
    }
}

private struct HeadcountCard: View {
    let groups: [HeadcountGroup]
    let checkedIn: Int
    let expected: Int
    var body: some View {
        Card {
            HStack {
                Text(tr(.todayHeadCount)).font(.caption2.weight(.semibold)).foregroundStyle(.secondary)
                Spacer()
                Text(tr2(.todayCheckedIn, checkedIn, expected)).font(.subheadline.weight(.semibold))
            }
            ForEach(groups, id: \.label) { g in
                let short = g.checkedIn < g.expected
                HStack(spacing: 10) {
                    Text(g.label).font(.subheadline).frame(width: 48, alignment: .leading)
                    ProgressView(value: Double(g.checkedIn), total: Double(max(g.expected, 1)))
                        .tint(Color(argb: short ? Tokens.Color.Light.warning : Tokens.Color.Light.action))
                    Text(short ? tr3(.todayGroupMissing, g.checkedIn, g.expected, g.expected - g.checkedIn) : "\(g.checkedIn)/\(g.expected)")
                        .font(.subheadline)
                }
                .padding(.top, 6)
            }
        }
    }
}

struct EventRow: View {
    let event: TodayEvent
    var body: some View {
        HStack(alignment: .center, spacing: 12) {
            VStack(alignment: .leading) {
                Text(event.start).font(.body.weight(.semibold))
                if let end = event.end { Text("– \(end)").font(.caption2).foregroundStyle(.secondary) }
            }
            .frame(width: 52, alignment: .leading)
            Image(systemName: symbol(event.kind))
                .frame(width: 36, height: 36)
                .background(RoundedRectangle(cornerRadius: 10).stroke(Color(argb: Tokens.Color.Light.border)))
                .foregroundStyle(.secondary)
            VStack(alignment: .leading, spacing: 2) {
                Text(event.title).font(.body.weight(.semibold))
                Text(event.place).font(.subheadline).foregroundStyle(.secondary)
                if let note = event.note { Text(note).font(.caption2.weight(.semibold)).foregroundStyle(Color(argb: Tokens.Color.Light.warning)) }
            }
            Spacer()
            StatusChip(status: event.status)
        }
        .padding(.vertical, 6)
    }

    private func symbol(_ kind: EventKind) -> String {
        switch kind {
        case .flight: return "airplane"
        case .bus: return "bus"
        case .meal: return "fork.knife"
        case .activity: return "flag"
        case .hotel: return "building.2"
        case .meeting: return "mappin"
        case .free: return "calendar"
        }
    }
}

struct StatusChip: View {
    let status: EventStatus
    var body: some View {
        let (label, color): (String, UInt32) = {
            switch status {
            case .scheduled: return (tr(.statusScheduled), Tokens.Color.Light.textMuted)
            case .inProgress: return (tr(.statusNow), Tokens.Color.Light.action)
            case .done: return (tr(.statusDone), Tokens.Color.Light.success)
            case .delayed: return (tr(.statusDelayed), Tokens.Color.Light.warning)
            case .cancelled: return (tr(.statusCancelled), Tokens.Color.Light.danger)
            }
        }()
        Text(label).font(.caption2.weight(.semibold))
            .foregroundStyle(Color(argb: color))
            .voyChip(tint: Color(argb: color))
    }
}

struct Card<Content: View>: View {
    @ViewBuilder let content: () -> Content
    var body: some View {
        VStack(alignment: .leading, spacing: 0, content: content)
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: 16).fill(Color(argb: Tokens.Color.Light.surface)))
            .overlay(RoundedRectangle(cornerRadius: 16).stroke(Color(argb: Tokens.Color.Light.border)))
    }
}

extension Color {
    /// ARGB literal from generated design tokens.
    init(argb: UInt32) {
        let a = Double((argb >> 24) & 0xFF) / 255
        let r = Double((argb >> 16) & 0xFF) / 255
        let g = Double((argb >> 8) & 0xFF) / 255
        let b = Double(argb & 0xFF) / 255
        self.init(.sRGB, red: r, green: g, blue: b, opacity: a)
    }
}
