// Copyright 2026- At Day. All rights reserved.
// Notification inbox (D29, slice 053). Mirrors InboxScreen on Android; rules in core
// (notifications/InboxModel.kt). Live with a client and a trip: my inbox from the API (what the
// lanes delivered by now, newest first), a read flipped here first and confirmed by the server's
// row (a failure puts it back and says so; offline keeps the local read and says so). Without a
// trip: the fixture inbox. Reached from the bell in the Today header.

import SwiftUI
import VoysembleCore

@MainActor
final class InboxModel: ObservableObject {
    @Published private(set) var inbox: Inbox
    @Published private(set) var syncing = false
    @Published private(set) var error: String?
    /// One line after a read that did not reach the server.
    @Published private(set) var notice: String?
    /// Rows whose read is on its way; they are disabled meanwhile.
    @Published private(set) var pending: Set<String> = []
    let api: ApiClient?
    let trip: ActiveTrip?
    var live: Bool { api != nil && trip != nil }

    init(inbox: Inbox? = nil, api: ApiClient? = nil, trip: ActiveTrip? = nil) {
        self.api = api
        self.trip = trip
        if let inbox {
            self.inbox = inbox
        } else if trip != nil, api != nil {
            self.inbox = InboxModelKt.emptyInbox()
        } else {
            self.inbox = KoreaConcertTourFixture.shared.inbox()
        }
    }

    func refresh() async {
        guard let api, let trip else { return }
        syncing = true
        defer { syncing = false }
        do {
            let r = try await api.myNotifications(orgId: trip.organizationId, tripId: trip.tripId, correlationId: nil)
            if let dto = (r as? ApiResultOk<MyNotificationsDto>)?.value {
                inbox = InboxModelKt.inboxOf(dto: dto, clock: { iso in Clocks.localDayTime(iso) })
                error = nil
            } else if let failed = r as? ApiResultFailed {
                error = tr1(.inboxLoadFailed, failed.error.code)
            } else {
                inbox = inbox.withOffline(offline: true)
                error = tr(.inboxOffline)
            }
        } catch {
            inbox = inbox.withOffline(offline: true)
            self.error = tr(.inboxOffline)
        }
    }

    /// Flip locally first; the server's row replaces it, a failure puts the old one back.
    func markRead(_ id: String) async {
        guard let before = inbox.items.first(where: { $0.id == id }), !before.read else { return }
        inbox = inbox.withRead(id: id)
        notice = nil
        guard let api, let trip else { return }
        pending.insert(id)
        defer { pending.remove(id) }
        do {
            let r = try await api.markNotificationRead(orgId: trip.organizationId, tripId: trip.tripId, notificationId: id, correlationId: nil)
            if let row = (r as? ApiResultOk<NotificationDto>)?.value {
                inbox = inbox.replaceItem(item: InboxModelKt.inboxItemOf(dto: row, clock: { iso in Clocks.localDayTime(iso) }))
            } else if let failed = r as? ApiResultFailed {
                inbox = inbox.replaceItem(item: before)
                notice = tr1(.inboxReadFailed, failed.error.code)
            } else {
                // Offline keeps the local read (the server's row is unread until the next sync) and says so.
                inbox = inbox.withOffline(offline: true)
                notice = tr(.inboxReadOffline)
            }
        } catch {
            inbox = inbox.withOffline(offline: true)
            notice = tr(.inboxReadOffline)
        }
    }
}

struct InboxView: View {
    @ObservedObject var model: InboxModel

    var body: some View {
        List {
            Section {
                VStack(alignment: .leading, spacing: 6) {
                    Text(tr(.inboxEyebrow).uppercased()).font(.caption).foregroundStyle(.secondary)
                    Text(tr(.inboxTitle)).font(.title2.bold())
                    HStack(spacing: 8) {
                        Text(model.inbox.summary()).font(.subheadline).foregroundStyle(.secondary)
                        Spacer()
                        statusChip
                    }
                    if let error = model.error { Text(error).font(.caption).foregroundStyle(Color(argb: Tokens.Color.Light.danger)) }
                    if let notice = model.notice { Text(notice).font(.caption).foregroundStyle(Color(argb: Tokens.Color.Light.warning)) }
                    Text(tr(.inboxHint)).font(.caption).foregroundStyle(.secondary)
                }
            }
            Section {
                if model.inbox.items.isEmpty && !model.syncing {
                    Text(tr(.inboxNone)).font(.subheadline).foregroundStyle(.secondary)
                }
                ForEach(model.inbox.items, id: \.id) { item in
                    InboxRow(item: item, pending: model.pending.contains(item.id)) {
                        Task { await model.markRead(item.id) }
                    }
                }
            } footer: {
                Text(tr(.inboxPushNote))
            }
        }
        .navigationTitle(tr(.inboxTitle))
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

/// One notification: the lane chip, the kind and the time, the title (bold while unread) and the body.
private struct InboxRow: View {
    let item: InboxItem
    let pending: Bool
    let onRead: () -> Void

    private var laneColor: Color {
        switch item.lane {
        case .priority: return Color(argb: Tokens.Color.Light.danger)
        case .normal: return Color(argb: Tokens.Color.Light.info)
        default: return Color.secondary
        }
    }

    var body: some View {
        Button(action: onRead) {
            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 8) {
                    Text(InboxModelKt.laneLabel(lane: item.lane)).font(.caption2.weight(.semibold))
                        .foregroundStyle(laneColor)
                        .voyChip(tint: laneColor)
                    Text("\(InboxModelKt.kindLabel(kind: item.kind)) · \(item.deliveredAt)").font(.caption).foregroundStyle(.secondary)
                    Spacer()
                    if !item.read { Circle().fill(Color(argb: Tokens.Color.Light.action)).frame(width: 8, height: 8) }
                }
                Text(item.title).font(item.read ? .body : .body.weight(.semibold))
                    .foregroundStyle(item.read ? .secondary : .primary)
                if !item.body.isEmpty { Text(item.body).font(.caption).foregroundStyle(.secondary) }
                if !item.read {
                    Text(tr(.inboxMarkRead)).font(.subheadline.weight(.semibold))
                        .foregroundStyle(Color(argb: Tokens.Color.Light.action))
                }
            }
        }
        .buttonStyle(.plain)
        .disabled(item.read || pending)
        .accessibilityLabel(item.spoken())
    }
}

/// The bell in the Today header: the unread count as a badge, the inbox behind it.
struct InboxBell: View {
    @ObservedObject var model: InboxModel

    var body: some View {
        let unread = Int(model.inbox.unreadCount())
        NavigationLink {
            InboxView(model: model)
        } label: {
            Image(systemName: unread > 0 ? "bell.badge" : "bell")
                .font(.title3)
                .foregroundStyle(Color(argb: Tokens.Color.Light.brand))
                .overlay(alignment: .topTrailing) {
                    if unread > 0 {
                        Text("\(unread)").font(.caption2.bold()).foregroundStyle(.white)
                            .padding(.horizontal, 5).padding(.vertical, 1)
                            .background(Capsule().fill(Color(argb: Tokens.Color.Light.danger)))
                            .offset(x: 10, y: -8)
                    }
                }
                .frame(width: 36, height: 36)
        }
        .accessibilityLabel(InboxModelKt.bellSpoken(unread: Int32(unread)))
        .task { if model.live && model.inbox.items.isEmpty { await model.refresh() } }
    }
}
