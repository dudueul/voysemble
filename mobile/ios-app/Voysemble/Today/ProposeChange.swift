// Copyright 2026- At Day. All rights reserved.
// The leader's proposal sheet (D24): a change of time or a removal for an existing event, or a
// new event on a day (slice 035). One form for Today's up-next card and the Plan tab, the same
// as ProposeChange.kt on Android; the draft rule and the wire shape live in core
// (plan/ProposalDraft.kt). The organizer decides on the console; nothing here edits the plan.

import SwiftUI
import VoysembleCore

/// The proposal in flight (D24): one at a time, the result shown where it was sent from.
struct ProposalState {
    let eventId: String
    var sending: Bool
    var sent: Bool
    var error: String?
    let kind: ProposalKind
}

/// What the sheet is about: an existing event (change or remove) or a new one on a day (add).
struct ProposalTarget: Identifiable {
    let id = UUID()
    let kinds: [ProposalKind]
    let eventId: String?
    let eventTitle: String?
    let dayLabel: String
    let date: String
    let timeZone: String
    let nextOrder: Int32

    /// Change or remove `event`; the day is unknown on Today's card and not needed for either.
    static func forEvent(_ event: TodayEvent, dayLabel: String = tr(.proposeDayToday), date: String = "", timeZone: String = "") -> ProposalTarget {
        ProposalTarget(kinds: [.edit, .remove], eventId: event.id, eventTitle: event.title, dayLabel: dayLabel, date: date, timeZone: timeZone, nextOrder: 0)
    }

    /// Add an event after the day's last one.
    static func forDay(_ day: PlanDay) -> ProposalTarget {
        ProposalTarget(kinds: [.add], eventId: nil, eventTitle: nil, dayLabel: "\(day.label) · \(day.dateLabel)", date: day.date, timeZone: day.timeZone, nextOrder: day.nextOrder)
    }
}

func kindLabel(_ kind: ProposalKind) -> String {
    if kind == ProposalKind.edit { return tr(.proposeChangeTime) }
    if kind == ProposalKind.remove { return tr(.proposeRemove) }
    return tr(.proposeAddEvent)
}

/// Send a draft the rule accepted and map the answer to the card's line. Shared by Today and Plan.
@MainActor
func sendProposal(api: ApiClient, trip: ActiveTrip, draft: ProposalDraft) async -> ProposalState {
    let eventId = draft.eventId ?? ""
    do {
        let r = try await api.sendProposal(orgId: trip.organizationId, tripId: trip.tripId, draft: draft)
        if r is ApiResultOk<ItineraryProposalDto> {
            return ProposalState(eventId: eventId, sending: false, sent: true, error: nil, kind: draft.kind)
        }
        if let failed = r as? ApiResultFailed {
            return ProposalState(eventId: eventId, sending: false, sent: false, error: ProposalDraftKt.proposalFailureMessage(status: failed.status, code: failed.error.code), kind: draft.kind)
        }
    } catch {}
    return ProposalState(eventId: eventId, sending: false, sent: false, error: ProposalDraftKt.proposalOfflineMessage(), kind: draft.kind)
}

/// Seed for the capture test; the app starts every field empty.
struct ProposalPrefill {
    var title = ""
    var start = ""
    var note = ""
}

/// Kind picker (when there is a choice), the fields for that kind, the note, Send and Cancel.
struct ProposeChangeForm: View {
    let target: ProposalTarget
    let onSend: (ProposalDraft) -> Void
    let onCancel: () -> Void
    @State private var kind: ProposalKind
    @State private var start: String
    @State private var end = ""
    @State private var title: String
    @State private var place = ""
    @State private var note: String

    init(target: ProposalTarget, prefill: ProposalPrefill = ProposalPrefill(), onSend: @escaping (ProposalDraft) -> Void, onCancel: @escaping () -> Void) {
        self.target = target
        self.onSend = onSend
        self.onCancel = onCancel
        _kind = State(initialValue: target.kinds[0])
        _start = State(initialValue: prefill.start)
        _title = State(initialValue: prefill.title)
        _note = State(initialValue: prefill.note)
    }

    private var draft: ProposalDraft {
        ProposalDraft(
            kind: kind, eventId: target.eventId, note: note, start: start, end: end, title: title, place: place,
            date: target.date, timeZone: target.timeZone, order: target.nextOrder,
        )
    }

    var body: some View {
        let problem = ProposalDraftKt.proposalDraftProblem(d: draft)
        VStack(alignment: .leading, spacing: 10) {
            Text(kind == ProposalKind.add ? tr(.proposeTitleEvent) : tr(.todayProposeChange)).font(.title3.bold())
            Text(target.eventTitle ?? target.dayLabel).font(.subheadline).foregroundStyle(.secondary)
            if target.kinds.count > 1 {
                Picker(tr(.proposeKind), selection: $kind) {
                    ForEach(target.kinds, id: \.self) { k in Text(kindLabel(k)).tag(k) }
                }
                .pickerStyle(.segmented)
            }
            if kind == ProposalKind.edit {
                TextField(tr(.proposeNewStart), text: $start).textFieldStyle(.roundedBorder)
            } else if kind == ProposalKind.remove {
                Text(tr(.proposeRemoveHint)).font(.subheadline).foregroundStyle(.secondary)
            } else {
                TextField(tr(.proposeFieldTitle), text: $title).textFieldStyle(.roundedBorder)
                HStack {
                    TextField(tr(.proposeFieldStart), text: $start).textFieldStyle(.roundedBorder)
                    TextField(tr(.proposeFieldEnd), text: $end).textFieldStyle(.roundedBorder)
                }
                TextField(tr(.proposeFieldPlace), text: $place).textFieldStyle(.roundedBorder)
            }
            TextField(tr(.proposeFieldWhy), text: $note, axis: .vertical).lineLimit(2...4).textFieldStyle(.roundedBorder)
            if let problem, !note.trimmingCharacters(in: .whitespaces).isEmpty {
                Text(problem).font(.caption).foregroundStyle(Color(argb: Tokens.Color.Light.warning))
            }
            HStack {
                Spacer()
                Button(tr(.commonCancel)) { onCancel() }.buttonStyle(.bordered)
                Button(tr(.commonSend)) { onSend(draft) }.buttonStyle(.borderedProminent).disabled(problem != nil)
            }
        }
    }
}

/// The sheet around the form, as the dialog on Android.
struct ProposeChangeSheet: View {
    let target: ProposalTarget
    let onSend: (ProposalDraft) -> Void
    let onCancel: () -> Void

    var body: some View {
        ScrollView {
            ProposeChangeForm(target: target, onSend: onSend, onCancel: onCancel).padding(20)
        }
        .presentationDetents([.medium, .large])
    }
}
