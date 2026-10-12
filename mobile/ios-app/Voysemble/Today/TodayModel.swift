// Copyright 2026- At Day. All rights reserved.
// Today screen state holder (SwiftUI). Mirrors TodayViewModel on Android; rules live in core.
// Live (slice 024) when constructed with the API client and the active trip: the published
// itinerary builds today's snapshot for the device date and clock in the trip's zone, the
// required-ack announcement rides on the card (rule in core), "Got it" posts the ack, and no
// signal keeps the last snapshot marked offline. Without a trip it shows the fixture.

import Foundation
import VoysembleCore

enum MainTab: CaseIterable { case today, plan, bulletin, chats, memories }

@MainActor
final class TodayModel: ObservableObject {
    @Published private(set) var snapshot: TodaySnapshot
    @Published var tab: MainTab = .today
    @Published private(set) var syncing = false
    @Published private(set) var error: String?
    /// D13: a guardian sees their traveler's status instead of the head count card and leader links.
    @Published private(set) var guardian: GuardianCard?
    /// D27 (slice 032): the guardian's own entry of the care note; nil until the status is known.
    @Published private(set) var careStatus: CareNoteStatusDto?
    /// The note being edited (prefilled from an audited reveal); nil when not editing.
    @Published private(set) var careDraft: CareNoteDto?
    @Published private(set) var careSaving = false
    @Published private(set) var careMessage: String?
    /// D24: the leader's proposal in flight from the up-next card (slice 018; remove and add since 035).
    @Published private(set) var proposal: ProposalState?
    /// Slice 074 (D17): the traveler's own latest help card (open, or the last resolved); nil when none names them.
    @Published private(set) var help: HelpCard?
    @Published private(set) var helpSending = false
    @Published private(set) var helpError: String?
    private var travelerId: String?

    let api: ApiClient?
    let trip: ActiveTrip?
    var live: Bool { api != nil && trip != nil }

    private let deviceDate: (String) -> String
    private let deviceClock: (String) -> String

    init(
        snapshot: TodaySnapshot = KoreaConcertTourFixture.shared.today(),
        api: ApiClient? = nil,
        trip: ActiveTrip? = nil,
        deviceDate: @escaping (String) -> String = { zone in Clocks.date(in: zone) },
        deviceClock: @escaping (String) -> String = { zone in Clocks.time(in: zone) },
        guardian: GuardianCard? = nil,
        careStatus: CareNoteStatusDto? = nil,
        careDraft: CareNoteDto? = nil,
        help: HelpCard? = nil,
    ) {
        self.api = api
        self.trip = trip
        self.guardian = guardian
        self.careStatus = careStatus
        self.careDraft = careDraft
        self.help = help
        self.deviceDate = deviceDate
        self.deviceClock = deviceClock
        if let trip, api != nil {
            self.snapshot = TodayLiveKt.emptyTodaySnapshot(tripName: trip.tripName)
        } else {
            self.snapshot = snapshot
        }
    }

    /** Local first; in live mode the ack is posted and confirmed (or stays pending offline). */
    func acknowledge(_ id: String) {
        snapshot = snapshot.acknowledgeAnnouncement(id: id)
        guard let api, let trip else { return }
        Task {
            let result = try? await api.ackAnnouncement(
                orgId: trip.organizationId, tripId: trip.tripId, announcementId: id,
                ackedAtDevice: ISO8601DateFormatter().string(from: Date()), correlationId: nil,
            )
            if result is ApiResultOk<AckResponseDto> { snapshot = snapshot.confirmAcknowledgment(id: id) }
        }
    }

    func refresh() async {
        guard let api, let trip else { return }
        syncing = true
        error = nil
        defer { syncing = false }
        do {
            let r = try await api.getItinerary(orgId: trip.organizationId, tripId: trip.tripId, correlationId: nil)
            if let itinerary = (r as? ApiResultOk<ItineraryDto>)?.value {
                let zone = itinerary.days.first?.timeZone ?? "UTC"
                var latest: AnnouncementDto? = nil
                let list = try? await api.listAnnouncements(orgId: trip.organizationId, tripId: trip.tripId, correlationId: nil)
                if let value = (list as? ApiResultOk<AnnouncementListDto>)?.value {
                    latest = TodayLiveKt.latestRequiredAck(announcements: value.announcements)
                }
                snapshot = TodayBuilderKt.todaySnapshotOf(
                    itinerary: itinerary, date: deviceDate(zone), now: deviceClock(zone),
                    minutesSinceSync: KotlinInt(int: 0), offline: false,
                ).withAnnouncement(announcement: latest?.toTodayAnnouncement(clock: Clocks.localTime))
                // D13: guardians get their traveler's status (never coordinates) on the same screen.
                if trip.role == "guardian" {
                    let g = try? await api.guardianStatus(orgId: trip.organizationId, tripId: trip.tripId, correlationId: nil)
                    if let status = (g as? ApiResultOk<GuardianStatusDto>)?.value {
                        let locale = Locale.current.language.languageCode?.identifier ?? "en"
                        guardian = GuardianModelKt.guardianCardOf(status: status, locale: locale, clock: { iso in Clocks.localTime(iso) })
                        travelerId = status.traveler.participationId
                        await loadCare()
                    }
                }
                // Slice 074: a traveler's own help card, from the cards the server lists for them.
                if trip.role == "traveler" {
                    let inc = try? await api.listIncidents(orgId: trip.organizationId, tripId: trip.tripId, correlationId: nil)
                    if let list = (inc as? ApiResultOk<IncidentListDto>)?.value {
                        help = HelpModelKt.helpCardOf(incidents: list.incidents, me: trip.participationId, clock: { iso in Clocks.localTime(iso) })
                    }
                }
            } else if let failed = r as? ApiResultFailed {
                error = tr1(.todayLoadFailed, failed.error.code)
            } else {
                snapshot = snapshot.withOffline(offline: true)
            }
        } catch {
            snapshot = snapshot.withOffline(offline: true)
        }
    }
}

extension TodayModel {
    // MARK: - Care note, guardian entry (D27, slice 032)

    func loadCare() async {
        guard let api, let trip, let travelerId else { return }
        let r = try? await api.careNoteStatus(orgId: trip.organizationId, tripId: trip.tripId, participationId: travelerId, correlationId: nil)
        if let status = (r as? ApiResultOk<CareNoteStatusDto>)?.value { careStatus = status }
    }

    /// Start editing: an existing note is revealed (audited) to prefill the fields; a new one starts
    /// blank without touching the network (CI run 38205444048 caught the guard ordering).
    func editCare() async {
        guard let status = careStatus else { return }
        careMessage = nil
        guard status.hasCareNote else {
            careDraft = CareNoteDto(allergies: "", medications: "", freeText: "")
            return
        }
        guard let api, let trip, let travelerId else { return }
        do {
            let r = try await api.revealCareNote(orgId: trip.organizationId, tripId: trip.tripId, participationId: travelerId, correlationId: nil)
            if let ok = (r as? ApiResultOk<RevealCareNoteResponseDto>)?.value {
                careDraft = ok.note
            } else if let failed = r as? ApiResultFailed {
                careMessage = tr1(.careOpenFailed, failed.error.code)
            } else {
                careMessage = tr(.careOfflineOpen)
            }
        } catch {
            careMessage = tr(.careOfflineOpen)
        }
    }

    func cancelCare() {
        careDraft = nil
        careMessage = nil
    }

    /// Save (a blank note clears it). The content is sealed on the server; the phone keeps nothing.
    func saveCare(_ note: CareNoteDto) async {
        guard let api, let trip, let travelerId else { return }
        careSaving = true
        careMessage = nil
        defer { careSaving = false }
        do {
            let r = try await api.putCareNote(orgId: trip.organizationId, tripId: trip.tripId, participationId: travelerId, note: note, correlationId: nil)
            if let status = (r as? ApiResultOk<CareNoteStatusDto>)?.value {
                careStatus = status
                careDraft = nil
                careMessage = status.hasCareNote ? tr1(.careSaved, guardian?.groupName ?? tr(.careTheGroup)) : tr(.careCleared)
            } else if let failed = r as? ApiResultFailed {
                careMessage = tr1(.careSaveFailed, failed.error.code)
            } else {
                careMessage = tr(.careOfflineSave)
            }
        } catch {
            careMessage = tr(.careOfflineSave)
        }
    }
}

extension TodayModel {
    // MARK: - Change proposals (D24; slice 018 edit, slice 035 remove and add)

    /// Leaders propose; travelers and guardians only read. Sample mode shows the affordance.
    var canPropose: Bool { trip == nil || trip?.role == "leader" }

    /// Slice 074 (D17): a traveler asks for help from Today; sample mode shows the card too.
    var canAskHelp: Bool { trip == nil || trip?.role == "traveler" }

    /// Slice 074: the traveler's words or none; the server's card comes back and the Today card
    /// tracks it; sample mode keeps a local card at the fixture's clock.
    func askHelp(_ text: String) async {
        helpError = nil
        guard let api, let trip else {
            let title = text.trimmingCharacters(in: .whitespacesAndNewlines)
            help = HelpCard(id: "local-help", title: title.isEmpty ? tr(.todayHelpDefault) : title, status: .open, openedAt: snapshot.now, resolvedAt: nil)
            return
        }
        helpSending = true
        defer { helpSending = false }
        do {
            let body = HelpModelKt.helpRequestOf(text: text, me: trip.participationId, defaultTitle: tr(.todayHelpDefault))
            let r = try await api.openIncident(orgId: trip.organizationId, tripId: trip.tripId, body: body, correlationId: nil)
            if let card = (r as? ApiResultOk<IncidentDto>)?.value {
                help = HelpModelKt.helpCardOf(incidents: [card], me: trip.participationId, clock: { iso in Clocks.localTime(iso) })
            } else if let failed = r as? ApiResultFailed {
                helpError = tr1(.todayHelpFailed, failed.error.code)
            } else {
                helpError = tr(.todayHelpOffline)
            }
        } catch {
            helpError = tr(.todayHelpOffline)
        }
    }

    /// Sample mode shows "sent" without the network; a bad draft says why; the rest is one core call.
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

/** Device date and clock in a zone, and ISO -> local HH:mm; one place for the format strings. */
enum Clocks {
    static func date(in zone: String) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(identifier: zone) ?? .current
        f.dateFormat = "yyyy-MM-dd"
        return f.string(from: Date())
    }

    static func time(in zone: String) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(identifier: zone) ?? .current
        f.dateFormat = "HH:mm"
        return f.string(from: Date())
    }

    static func now() -> String { time(in: TimeZone.current.identifier) }

    /** ISO 8601 (with or without fractional seconds) to local HH:mm; the input when unparseable. */
    static func localTime(_ iso: String) -> String {
        guard let date = parse(iso) else { return iso }
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "HH:mm"
        return f.string(from: date)
    }

    /**
     * Slice 053: "06:52" when the instant falls on the device's current date, "12-30 21:05" before
     * (the inbox's row label, as InboxViewModel.deviceLabel prints it on Android); the input when
     * unparseable.
     */
    static func localDayTime(_ iso: String, now: Date = Date()) -> String {
        guard let date = parse(iso) else { return iso }
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = Calendar.current.isDate(date, inSameDayAs: now) ? "HH:mm" : "MM-dd HH:mm"
        return f.string(from: date)
    }

    private static func parse(_ iso: String) -> Date? {
        let withFraction = ISO8601DateFormatter()
        withFraction.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let plain = ISO8601DateFormatter()
        return withFraction.date(from: iso) ?? plain.date(from: iso)
    }

    static func isoNow() -> String { ISO8601DateFormatter().string(from: Date()) }
}
