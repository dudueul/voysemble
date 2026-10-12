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
    ) {
        self.api = api
        self.trip = trip
        self.guardian = guardian
        self.careStatus = careStatus
        self.careDraft = careDraft
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
            } else if let failed = r as? ApiResultFailed {
                error = "Could not load the itinerary (\(failed.error.code))."
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

    /// Start editing: an existing note is revealed (audited) to prefill the fields; a new one starts blank.
    func editCare() async {
        guard let api, let trip, let travelerId, let status = careStatus else { return }
        careMessage = nil
        guard status.hasCareNote else {
            careDraft = CareNoteDto(allergies: "", medications: "", freeText: "")
            return
        }
        do {
            let r = try await api.revealCareNote(orgId: trip.organizationId, tripId: trip.tripId, participationId: travelerId, correlationId: nil)
            if let ok = (r as? ApiResultOk<RevealCareNoteResponseDto>)?.value {
                careDraft = ok.note
            } else if let failed = r as? ApiResultFailed {
                careMessage = "Could not open the care note (\(failed.error.code))."
            } else {
                careMessage = "Offline. The care note needs one connection."
            }
        } catch {
            careMessage = "Offline. The care note needs one connection."
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
                careMessage = status.hasCareNote ? "Care note saved. Leaders of \(guardian?.groupName ?? "the group") can reveal it." : "Care note cleared."
            } else if let failed = r as? ApiResultFailed {
                careMessage = "Could not save the care note (\(failed.error.code))."
            } else {
                careMessage = "Offline. The care note was not saved."
            }
        } catch {
            careMessage = "Offline. The care note was not saved."
        }
    }
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
        let withFraction = ISO8601DateFormatter()
        withFraction.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let plain = ISO8601DateFormatter()
        guard let date = withFraction.date(from: iso) ?? plain.date(from: iso) else { return iso }
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "HH:mm"
        return f.string(from: date)
    }

    static func isoNow() -> String { ISO8601DateFormatter().string(from: Date()) }
}
