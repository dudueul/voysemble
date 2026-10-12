// Copyright 2026- At Day. All rights reserved.
// Memories tab (D18, slice 044). Mirrors MemoriesScreen on Android; rules in core
// (memories/MemoriesModel.kt). Live with a client and a trip: the photos the server lets this
// participant see, thumbnails fetched with the bearer token, uploads from PhotosPicker with a
// thumbnail made here (D34), a leader's decisions and the uploader's delete. Without a trip: the
// fixture, as the leader (or the role given for captures). Glass only on chips and the picker
// button (D32); the grid stays opaque.

import PhotosUI
import SwiftUI
import VoysembleCore

@MainActor
final class MemoriesModel: ObservableObject {
    @Published private(set) var feed: MemoriesFeed
    @Published private(set) var thumbnails: [String: UIImage] = [:]
    @Published private(set) var syncing = false
    @Published private(set) var error: String?
    @Published private(set) var notice: String?
    @Published var picked: [PhotosPickerItem] = []
    let api: ApiClient?
    let trip: ActiveTrip?
    /// traveler | leader | guardian; nil in sample mode (the leader view).
    let role: String?
    var live: Bool { api != nil && trip != nil }
    static let thumbnailEdge: CGFloat = 320

    init(feed: MemoriesFeed? = nil, api: ApiClient? = nil, trip: ActiveTrip? = nil, sampleRole: String? = nil) {
        self.api = api
        self.trip = trip
        self.role = trip?.role ?? sampleRole
        if let feed {
            self.feed = feed
        } else if api != nil, trip != nil {
            self.feed = MemoriesFeed(photos: [], offline: false, uploading: 0)
        } else {
            self.feed = KoreaConcertTourFixture.shared.memories()
        }
    }

    var canUpload: Bool { MemoriesModelKt.canUploadPhotos(role: role) }
    var canReview: Bool { MemoriesModelKt.canReviewPhotos(role: role) }
    var queue: [Memory] { feed.queue() }
    var pool: [Memory] { feed.pool() }
    var album: [Memory] { feed.album() }
    var summary: String { feed.summary(role: role) }

    func refresh() async {
        guard let api, let trip else { return }
        syncing = true
        defer { syncing = false }
        do {
            let r = try await api.listPhotos(orgId: trip.organizationId, tripId: trip.tripId, correlationId: nil)
            if let list = (r as? ApiResultOk<PhotoListDto>)?.value {
                let photos = list.photos.map { $0.toMemory() }
                feed = feed.replace(photos: photos)
                error = nil
                for p in photos where thumbnails[p.id] == nil { await loadThumbnail(p) }
            } else if let failed = r as? ApiResultFailed {
                error = failed.status == 403 ? tr(.memRefused) : tr1(.memLoadFailed, failed.error.code)
            } else {
                feed = feed.withOffline(offline: true)
                error = tr(.memOffline)
            }
        } catch {
            feed = feed.withOffline(offline: true)
            self.error = tr(.memOffline)
        }
    }

    private func loadThumbnail(_ p: Memory) async {
        guard let api else { return }
        let r = try? await api.photoBytes(apiPath: p.thumbnailPath, correlationId: nil)
        if let bytes = (r as? ApiResultOk<KotlinByteArray>)?.value, let image = UIImage(data: DataBridgeKt.dataOf(bytes: bytes)) {
            thumbnails[p.id] = image
        }
    }

    /// The picker's items: each becomes JPEG bytes plus a thumbnail made here, then goes up.
    func uploadPicked() async {
        let items = picked
        picked = []
        guard !items.isEmpty else { return }
        var images: [(original: Data, thumbnail: Data?)] = []
        for item in items {
            if let data = try? await item.loadTransferable(type: Data.self), let image = UIImage(data: data) {
                // Re-encoded as JPEG: one type for the original and the thumbnail, EXIF left behind here already.
                if let jpeg = image.jpegData(compressionQuality: 0.9) {
                    images.append((original: jpeg, thumbnail: Self.thumbnail(of: image)))
                }
            }
        }
        await upload(images)
    }

    func upload(_ images: [(original: Data, thumbnail: Data?)]) async {
        guard let api, let trip else {
            notice = tr1(.memUploaded, images.count)
            return
        }
        notice = tr1(.memUploading, images.count)
        var done = 0
        var failure: String?
        for (original, thumbnail) in images {
            let upload = PhotoUpload(
                original: DataBridgeKt.bytesOf(data: original),
                thumbnail: thumbnail.map { DataBridgeKt.bytesOf(data: $0) },
                contentType: "image/jpeg", takenAt: Clocks.isoNow(),
            )
            do {
                let r = try await api.uploadPhoto(orgId: trip.organizationId, tripId: trip.tripId, upload: upload, correlationId: nil)
                if let photo = (r as? ApiResultOk<PhotoDto>)?.value {
                    done += 1
                    let m = photo.toMemory()
                    feed = feed.upsert(photo: m)
                    await loadThumbnail(m)
                } else if let failed = r as? ApiResultFailed {
                    failure = tr1(.memUploadFailed, failed.error.code)
                } else {
                    failure = tr(.memUploadOffline)
                }
            } catch {
                failure = tr(.memUploadOffline)
            }
        }
        notice = failure ?? tr1(.memUploaded, done)
    }

    static func thumbnail(of image: UIImage, edge: CGFloat = thumbnailEdge) -> Data? {
        let longest = max(image.size.width, image.size.height)
        let scale = min(1, edge / max(longest, 1))
        let size = CGSize(width: max(1, image.size.width * scale), height: max(1, image.size.height * scale))
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        let small = UIGraphicsImageRenderer(size: size, format: format).image { _ in image.draw(in: CGRect(origin: .zero, size: size)) }
        return small.jpegData(compressionQuality: 0.85)
    }

    /// A leader clears the flag ("clear") or removes the photo ("remove").
    func review(_ photoId: String, decision: String) async {
        guard let api, let trip else { return }
        let r = try? await api.reviewPhoto(orgId: trip.organizationId, tripId: trip.tripId, photoId: photoId, decision: decision, correlationId: nil)
        if let photo = (r as? ApiResultOk<PhotoDto>)?.value {
            feed = decision == "remove" ? feed.without(photoId: photoId) : feed.upsert(photo: photo.toMemory())
            notice = nil
        } else {
            failed(r)
        }
    }

    /// Into the guardian album, tagged whole group (per-person tags are the console's job).
    func album(_ photoId: String) async {
        guard let api, let trip else { return }
        let r = try? await api.albumPhoto(orgId: trip.organizationId, tripId: trip.tripId, photoId: photoId, tags: AlbumPhotoRequestDto(wholeGroup: true, participationIds: []), correlationId: nil)
        if let photo = (r as? ApiResultOk<PhotoDto>)?.value {
            feed = feed.upsert(photo: photo.toMemory())
            notice = nil
        } else {
            failed(r)
        }
    }

    func delete(_ photoId: String) async {
        guard let api, let trip else { return }
        let r = try? await api.deletePhoto(orgId: trip.organizationId, tripId: trip.tripId, photoId: photoId, correlationId: nil)
        if r is ApiResultOk<DeletePhotoResponseDto> {
            feed = feed.without(photoId: photoId)
            notice = nil
        } else {
            failed(r)
        }
    }

    private func failed(_ r: Any?) {
        if let failed = r as? ApiResultFailed {
            notice = failed.status == 403 ? tr(.memRefused) : tr1(.memActionFailed, failed.error.code)
        } else {
            notice = tr(.memOffline)
        }
    }
}

struct MemoriesView: View {
    @StateObject var model: MemoriesModel
    private let columns = [GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8)]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                header
                if let error = model.error { Text(error).font(.callout).foregroundStyle(Color(argb: Tokens.Color.Light.danger)) }
                if let notice = model.notice { Text(notice).font(.callout).foregroundStyle(.secondary) }
                if model.canUpload {
                    PhotosPicker(selection: $model.picked, maxSelectionCount: 5, matching: .images) {
                        Label(tr(.memAdd), systemImage: "photo.badge.plus")
                    }
                    .voyButton(prominent: true)
                    .onChange(of: model.picked) { _, items in
                        if !items.isEmpty { Task { await model.uploadPicked() } }
                    }
                }
                if model.canReview, !model.queue.isEmpty {
                    sectionLabel(tr(.memQueue))
                    Text(tr(.memQueueHint)).font(.caption).foregroundStyle(.secondary)
                    ForEach(model.queue, id: \.id) { m in QueueRow(memory: m, image: model.thumbnails[m.id], model: model) }
                }
                if model.role == "guardian" {
                    sectionLabel(tr(.memAlbum))
                    Text(tr(.memAlbumHint)).font(.caption).foregroundStyle(.secondary)
                    if model.album.isEmpty { Text(tr(.memNoneGuardian)).foregroundStyle(.secondary) }
                    grid(model.album)
                } else {
                    sectionLabel(tr(.memPool))
                    if model.pool.isEmpty, !model.syncing { Text(tr(.memNone)).foregroundStyle(.secondary) }
                    grid(model.pool)
                }
            }
            .padding(16)
        }
        .background(Color(uiColor: .systemGroupedBackground))
        .navigationBarHidden(true)
        .task { await model.refresh() }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(tr(.memEyebrow)).font(.caption2.weight(.semibold)).foregroundStyle(.secondary)
            HStack {
                Text(tr(.memTitle)).font(.largeTitle.bold())
                Spacer()
                statusChip
            }
            Text(model.summary).font(.subheadline).foregroundStyle(.secondary)
        }
    }

    private var statusChip: some View {
        let (label, color): (String, UInt32) = model.live
            ? (model.syncing ? (tr(.commonSyncing), Tokens.Color.Light.warning) : (tr(.commonLive), Tokens.Color.Light.success))
            : (tr(.commonSampleData), Tokens.Color.Light.pending)
        return Text(label).font(.caption2.weight(.semibold)).foregroundStyle(Color(argb: color)).voyChip(tint: Color(argb: color))
    }

    private func sectionLabel(_ text: String) -> some View {
        Text(text.uppercased()).font(.caption.weight(.semibold)).foregroundStyle(.secondary)
    }

    private func grid(_ photos: [Memory]) -> some View {
        LazyVGrid(columns: columns, alignment: .leading, spacing: 10) {
            ForEach(photos, id: \.id) { m in PhotoCell(memory: m, image: model.thumbnails[m.id], model: model) }
        }
    }
}

private struct Thumb: View {
    let memory: Memory
    let image: UIImage?
    var body: some View {
        let spoken = tr2(.memOpenSpoken, memory.uploaderName, memory.day > 0 ? tr1(.memDay, memory.day) : tr(.memDayOutside))
        GeometryReader { geo in
            Group {
                if let image {
                    Image(uiImage: image).resizable().scaledToFill()
                } else {
                    let hue = Double(abs(memory.id.hashValue % 360)) / 360
                    LinearGradient(colors: [Color(hue: hue, saturation: 0.55, brightness: 0.9), Color(hue: (hue + 0.11).truncatingRemainder(dividingBy: 1), saturation: 0.55, brightness: 0.7)], startPoint: .topLeading, endPoint: .bottomTrailing)
                }
            }
            .frame(width: geo.size.width, height: geo.size.height)
            .clipped()
        }
        .aspectRatio(1, contentMode: .fit)
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .accessibilityLabel(spoken)
    }
}

private struct PhotoCell: View {
    let memory: Memory
    let image: UIImage?
    @ObservedObject var model: MemoriesModel
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Thumb(memory: memory, image: image)
            Text(memory.caption()).font(.caption2).foregroundStyle(.secondary).lineLimit(2)
            if memory.status == "approved" {
                Text(tr(.memInAlbum)).font(.caption2.weight(.semibold))
                    .foregroundStyle(Color(argb: Tokens.Color.Light.success))
                    .voyChip(tint: Color(argb: Tokens.Color.Light.success))
                let label = memory.albumLabel()
                if !label.isEmpty { Text(label).font(.caption2).foregroundStyle(.secondary).lineLimit(1) }
            }
            if model.canReview, memory.status == "pool" {
                Button(tr(.memAddToAlbum)) { Task { await model.album(memory.id) } }
                    .font(.caption2).buttonStyle(.plain).foregroundStyle(Color(argb: Tokens.Color.Light.brand))
                    .accessibilityLabel(tr1(.memTagGroupSpoken, memory.uploaderName))
            }
            if memory.canDelete(role: model.role) {
                Button(memory.mine ? tr(.memDeleteMine) : tr(.memDelete)) { Task { await model.delete(memory.id) } }
                    .font(.caption2).buttonStyle(.plain).foregroundStyle(Color(argb: Tokens.Color.Light.danger))
            }
        }
    }
}

private struct QueueRow: View {
    let memory: Memory
    let image: UIImage?
    @ObservedObject var model: MemoriesModel
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 10) {
                Thumb(memory: memory, image: image).frame(width: 64, height: 64)
                VStack(alignment: .leading, spacing: 2) {
                    Text(MemoriesModelKt.flagLabel(flag: memory.flag)).font(.subheadline.weight(.semibold))
                    Text(memory.caption()).font(.caption).foregroundStyle(.secondary)
                }
            }
            HStack(spacing: 8) {
                Button(tr(.memApprove)) { Task { await model.review(memory.id, decision: "clear") } }.voyButton(prominent: true)
                Button(tr(.memRemove)) { Task { await model.review(memory.id, decision: "remove") } }.voyButton()
            }
        }
        .padding(12)
        .background(Color(uiColor: .secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 14))
    }
}
