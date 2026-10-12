// Copyright 2026- At Day. All rights reserved.
//
// The trip switch on the phone (slice 067, D42): the account's trips in a sheet from the Today
// header; picking one rebinds the session and the root re-keys every screen on the trip. The
// list is its own view so a capture renders it without a sheet.

import SwiftUI
import VoysembleCore

struct TripSwitchSheet: View {
    @ObservedObject var session: SessionModel
    let currentTripId: String
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            TripChoiceList(choices: session.tripChoices, error: session.tripChoicesError, currentTripId: currentTripId) { choice in
                dismiss()
                session.switchTrip(choice)
            }
            .navigationTitle(tr(.tripSwitchTitle))
            .navigationBarTitleDisplayMode(.inline)
        }
        .task { await session.loadTripChoices() }
    }
}

struct TripChoiceList: View {
    let choices: [TripChoice]?
    let error: String?
    let currentTripId: String
    let onPick: (TripChoice) -> Void

    var body: some View {
        List {
            if let error {
                Text(error).foregroundStyle(.red)
            } else if let choices {
                if choices.count <= 1 { Text(tr(.tripOnlyOne)).foregroundStyle(.secondary) }
                ForEach(choices, id: \.trip.tripId) { choice in
                    let current = choice.trip.tripId == currentTripId
                    Button { if !current { onPick(choice) } } label: {
                        HStack(alignment: .center) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(choice.trip.tripName).font(.headline).foregroundStyle(.primary)
                                Text("\(choice.trip.organizationName) · \(choice.roleLine())").font(.subheadline).foregroundStyle(.secondary)
                                if !choice.dateLine().isEmpty { Text(choice.dateLine()).font(.caption).foregroundStyle(.secondary) }
                            }
                            Spacer()
                            if current {
                                Text(tr(.tripCurrent)).font(.caption2.weight(.semibold))
                                    .foregroundStyle(Color(argb: Tokens.Color.Light.success))
                                    .voyChip(tint: Color(argb: Tokens.Color.Light.success))
                            }
                        }
                    }
                    .accessibilityLabel(current ? "\(choice.trip.tripName) · \(tr(.tripCurrent))" : choice.switchSpoken())
                }
            } else {
                Text(tr(.commonSyncing)).foregroundStyle(.secondary)
            }
        }
    }
}
