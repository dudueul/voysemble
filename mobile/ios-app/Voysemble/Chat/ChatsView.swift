// Copyright 2026- At Day. All rights reserved.
// Chats tab (D22, slice 033). Mirrors ChatsScreen on Android; rules in core (chat/ChatModel.kt).
// Live with a client and a trip: the channel list, one open thread, local-first sends, and a
// poll every 15 seconds while the tab is on screen. Without a trip: the fixture.

import SwiftUI
import VoysembleCore

@MainActor
final class ChatsModel: ObservableObject {
    @Published private(set) var channels: [ChatChannel]
    /// The open thread, or nil on the channel list.
    @Published private(set) var open: ChatThread?
    @Published private(set) var syncing = false
    @Published private(set) var error: String?
    let api: ApiClient?
    let trip: ActiveTrip?
    var live: Bool { api != nil && trip != nil }
    private let deviceClock: () -> String
    private let newId: () -> String
    private let senderName: String
    static let tickSeconds: Double = 15

    init(
        channels: [ChatChannel]? = nil,
        api: ApiClient? = nil,
        trip: ActiveTrip? = nil,
        deviceClock: @escaping () -> String = { Clocks.now() },
        newId: @escaping () -> String = { "local-\(UUID().uuidString)" },
        senderName: String = tr(.commonMe)
    ) {
        self.api = api
        self.trip = trip
        self.deviceClock = deviceClock
        self.newId = newId
        self.senderName = senderName
        if let channels {
            self.channels = channels
        } else if api != nil, trip != nil {
            self.channels = []
        } else {
            self.channels = KoreaConcertTourFixture.shared.chats()
        }
    }

    var unreadTotal: Int { Int(ChatModelKt.unreadTotal(channels)) }

    /// The screen's lifetime: one refresh, then the poll until the view goes.
    func run() async {
        await refresh()
        guard live else { return }
        while !Task.isCancelled {
            try? await Task.sleep(for: .seconds(Self.tickSeconds))
            if Task.isCancelled { return }
            await refresh()
        }
    }

    /// The list, or the open thread, whichever is on screen.
    func refresh() async {
        guard let api, let trip else { return }
        syncing = true
        defer { syncing = false }
        do {
            if let thread = open {
                let r = try await api.chatMessages(orgId: trip.organizationId, tripId: trip.tripId, channelId: thread.channel.id, correlationId: nil)
                if let list = (r as? ApiResultOk<ChatMessageListDto>)?.value {
                    open = thread.mergeRemote(channel: list.channel.toChatChannel(clock: Clocks.localTime), remote: list.messages.map { $0.toChatMessage(clock: Clocks.localTime) })
                    error = nil
                } else if let failed = r as? ApiResultFailed {
                    error = failed.status == 403 ? tr(.chatNotMember) : tr1(.chatMessagesFailed, failed.error.code)
                } else {
                    open = ChatThread(channel: thread.channel, messages: thread.messages, offline: true)
                }
            } else {
                let r = try await api.listChats(orgId: trip.organizationId, tripId: trip.tripId, correlationId: nil)
                if let list = (r as? ApiResultOk<ChatChannelListDto>)?.value {
                    channels = list.channels.map { $0.toChatChannel(clock: Clocks.localTime) }
                    error = nil
                } else if let failed = r as? ApiResultFailed {
                    error = tr1(.chatLoadFailed, failed.error.code)
                } else {
                    error = tr(.chatOffline)
                }
            }
        } catch {
            if let thread = open { open = ChatThread(channel: thread.channel, messages: thread.messages, offline: true) } else { self.error = tr(.chatOffline) }
        }
    }

    /// Open a channel: sample mode shows the fixture thread; live fetches (and marks it read).
    func openChannel(_ id: String) async {
        guard let channel = channels.first(where: { $0.id == id }) else { return }
        if !live {
            let fixture = KoreaConcertTourFixture.shared.chatThread()
            open = fixture.channel.id == id ? fixture : ChatThread(channel: channel, messages: [], offline: false)
            return
        }
        open = ChatThread(channel: channel, messages: [], offline: false)
        channels = channels.map { $0.id == id ? ChatChannel(id: $0.id, kind: $0.kind, title: $0.title, subtitle: $0.subtitle, unread: 0, lastPreview: $0.lastPreview, lastAt: $0.lastAt) : $0 }
        await refresh()
    }

    func close() {
        open = nil
        error = nil
    }

    /// Local first (pending), then one send; a failure keeps the text as failed for retry.
    func send(_ body: String) async {
        let text = body.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, let thread = open else { return }
        let localId = newId()
        open = thread.appendPending(localId: localId, body: text, at: deviceClock(), senderName: senderName, senderRole: trip?.role ?? "traveler")
        guard let api, let trip else { return }
        do {
            let r = try await api.sendChatMessage(orgId: trip.organizationId, tripId: trip.tripId, channelId: thread.channel.id, body: text, correlationId: nil)
            if let dto = (r as? ApiResultOk<ChatMessageDto>)?.value {
                open = open?.confirm(localId: localId, server: dto.toChatMessage(clock: Clocks.localTime))
            } else if let failed = r as? ApiResultFailed {
                open = open?.fail(localId: localId, offline: false)
                error = failed.status == 403 ? tr(.chatNotMember) : tr1(.chatRefused, failed.error.code)
            } else {
                open = open?.fail(localId: localId, offline: true)
            }
        } catch {
            open = open?.fail(localId: localId, offline: true)
        }
    }

    func retry(_ localId: String) async {
        guard let text = open?.retryText(localId: localId) else { return }
        open = open?.remove(localId: localId)
        await send(text)
    }

    /// Slice 065: remove a message (own, or any in a group or traveler channel as its leader); the
    /// server keeps a tombstone and the bubble names who removed it. Sample mode removes locally.
    func remove(_ id: String) async {
        guard let thread = open, let target = thread.messages.first(where: { $0.id == id }) else { return }
        guard let api, let trip else {
            open = thread.markRemoved(id: id, byName: target.mine ? target.senderName : senderName)
            return
        }
        do {
            let r = try await api.removeChatMessage(orgId: trip.organizationId, tripId: trip.tripId, channelId: thread.channel.id, messageId: id, correlationId: nil)
            if let dto = (r as? ApiResultOk<ChatMessageDto>)?.value {
                open = open?.markRemoved(id: id, byName: dto.removed?.byName ?? senderName)
                error = nil
            } else if let failed = r as? ApiResultFailed {
                error = tr1(.chatRemoveFailed, failed.error.code)
            } else {
                error = tr(.chatOffline)
            }
        } catch {
            self.error = tr(.chatOffline)
        }
    }
}

struct ChatsView: View {
    @ObservedObject var model: ChatsModel

    var body: some View {
        Group {
            if let thread = model.open {
                ThreadView(model: model, thread: thread)
            } else {
                channelList
            }
        }
        .task { await model.run() }
    }

    private var channelList: some View {
        List {
            Section {
                VStack(alignment: .leading, spacing: 4) {
                    Text(tr(.chatEyebrow).uppercased()).font(.caption).foregroundStyle(.secondary)
                    Text(model.unreadTotal == 0 ? tr(.chatCaughtUp) : tr1(.chatUnread, model.unreadTotal)).font(.largeTitle.bold())
                    Text(tr(.chatRule)).font(.caption).foregroundStyle(.secondary)
                    Text(model.live ? (model.syncing ? tr(.commonSyncing) : tr(.commonLive)) : tr(.commonSampleData)).font(.caption2.weight(.semibold)).foregroundStyle(.secondary)
                    if let error = model.error { Text(error).font(.caption).foregroundStyle(.red) }
                }
            }
            Section {
                ForEach(model.channels, id: \.id) { ch in
                    Button {
                        Task { await model.openChannel(ch.id) }
                    } label: {
                        HStack(spacing: 10) {
                            Image(systemName: ch.kind == "trip" ? "person.3" : ch.kind == "group" ? "bus" : "bubble.left.and.bubble.right")
                                .foregroundStyle(Color(argb: Tokens.Color.Light.action))
                            VStack(alignment: .leading, spacing: 2) {
                                HStack(spacing: 6) {
                                    Text(ch.title).font(.headline)
                                    if ch.unread > 0 {
                                        Text(tr1(.chatNew, ch.unread)).font(.caption2.weight(.semibold))
                                            .foregroundStyle(Color(argb: Tokens.Color.Light.action))
                                            .voyChip(tint: Color(argb: Tokens.Color.Light.action))
                                    }
                                }
                                Text(ch.lastPreview ?? ch.subtitle).font(.subheadline).foregroundStyle(.secondary).lineLimit(1)
                            }
                            Spacer()
                            if let at = ch.lastAt { Text(at).font(.caption).foregroundStyle(.secondary) }
                        }
                    }
                    .accessibilityLabel(tr1(.chatOpenSpoken, ch.title))
                }
            }
        }
        .navigationTitle(tr(.chatEyebrow))
    }
}

private struct ThreadView: View {
    @ObservedObject var model: ChatsModel
    let thread: ChatThread
    @State private var draft = ""

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Button { model.close() } label: { Image(systemName: "chevron.left") }
                VStack(alignment: .leading) {
                    Text(thread.channel.title).font(.headline)
                    Text(thread.channel.subtitle).font(.caption).foregroundStyle(.secondary)
                }
                Spacer()
                Text(model.live ? (thread.offline ? tr(.commonOffline) : (model.syncing ? tr(.commonSyncing) : tr(.commonLive))) : tr(.commonSampleData))
                    .font(.caption2.weight(.semibold)).foregroundStyle(.secondary)
            }
            .padding()
            if let error = model.error { Text(error).font(.caption).foregroundStyle(.red).padding(.horizontal) }
            ScrollView {
                LazyVStack(spacing: 8) {
                    if thread.messages.isEmpty {
                        Text(tr(.chatNoMessages)).font(.subheadline).foregroundStyle(.secondary)
                    }
                    ForEach(thread.messages, id: \.id) { m in bubble(m) }
                }
                .padding(.horizontal)
            }
            HStack(spacing: 8) {
                TextField(tr(.chatMessage), text: $draft, axis: .vertical).textFieldStyle(.roundedBorder).lineLimit(1...4)
                Button(tr(.commonSend)) {
                    let text = draft
                    draft = ""
                    Task { await model.send(text) }
                }
                .voyButton(prominent: true)
                .disabled(draft.trimmingCharacters(in: .whitespaces).isEmpty)
            }
            .padding()
        }
    }

    private func bubble(_ m: ChatMessage) -> some View {
        // Slice 065: the long-press menu offers Remove when the reader may (core `canRemove`).
        let removable = m.removedBy == nil && !m.pending && !m.failed
            && ChatModelKt.canRemove(channelKind: thread.channel.kind, viewerRole: model.trip?.role ?? "traveler", mine: m.mine)
        return HStack {
            if m.mine { Spacer(minLength: 40) }
            VStack(alignment: .leading, spacing: 2) {
                if !m.mine { Text(m.senderName).font(.caption2).foregroundStyle(.secondary) }
                if let removedBy = m.removedBy {
                    Text(tr1(.chatRemovedBy, removedBy)).font(.body.italic()).opacity(0.8)
                } else {
                    Text(m.body).font(.body)
                }
                Text(m.failed ? tr(.chatNotSent) : (m.pending ? tr(.chatSending) : m.sentAt))
                    .font(.caption2).foregroundStyle(m.failed ? .red : (m.mine ? .white.opacity(0.8) : .secondary))
            }
            .padding(.horizontal, 12).padding(.vertical, 8)
            .background(RoundedRectangle(cornerRadius: 14).fill(m.mine ? Color(argb: Tokens.Color.Light.action) : Color.secondary.opacity(0.12)))
            .foregroundStyle(m.mine ? .white : .primary)
            .onTapGesture { if m.failed { Task { await model.retry(m.id) } } }
            .contextMenu {
                if removable {
                    Button(role: .destructive) { Task { await model.remove(m.id) } } label: {
                        Label(tr(.chatRemove), systemImage: "trash")
                    }
                }
            }
            .accessibilityLabel(removable ? tr1(.chatRemoveSpoken, m.senderName) : (m.removedBy.map { tr1(.chatRemovedBy, $0) } ?? m.body))
            if !m.mine { Spacer(minLength: 40) }
        }
    }
}
