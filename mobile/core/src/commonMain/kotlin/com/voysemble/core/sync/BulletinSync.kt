// Copyright 2026- At Day. All rights reserved.
//
// One bulletin refresh: replay the ack outbox first (so a queued ack is not shown as missing
// after the fetch), then fetch and merge. Offline or server failure keeps the local feed and
// marks it offline; nothing is lost because the outbox survives in the feed.

package com.voysemble.core.sync

import com.voysemble.core.announcements.AnnouncementFeed
import com.voysemble.core.api.ApiClient
import com.voysemble.core.api.ApiResult
import com.voysemble.core.api.mergeAnnouncements
import com.voysemble.core.api.replayAckOutbox

public data class BulletinSyncResult(val feed: AnnouncementFeed, val reachable: Boolean, val confirmed: Int)

public suspend fun syncBulletin(
    api: ApiClient,
    orgId: String,
    tripId: String,
    local: AnnouncementFeed,
    ackedAtDevice: (announcementId: String) -> String,
    clock: (iso: String) -> String,
): BulletinSyncResult {
    val replay = replayAckOutbox(local, ackedAtDevice) { id, at -> api.ackAnnouncement(orgId, tripId, id, at) }
    return when (val r = api.listAnnouncements(orgId, tripId)) {
        is ApiResult.Ok -> BulletinSyncResult(
            feed = mergeAnnouncements(replay.feed, r.value.announcements, clock).copy(offline = false),
            reachable = true,
            confirmed = replay.confirmed.size,
        )
        is ApiResult.Failed, is ApiResult.Unreachable -> BulletinSyncResult(
            feed = replay.feed.copy(offline = r is ApiResult.Unreachable),
            reachable = false,
            confirmed = replay.confirmed.size,
        )
    }
}
