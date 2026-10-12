// Copyright 2026- At Day. All rights reserved.
// The three notification channels of D29 (slice 053), one per lane, created at launch so the
// phone's settings show them before the first push: priority at high importance (the head-count
// call, the incident update, the required announcement), normal at the default, the digest low.
// Creating a channel that exists is a no-op (Android keeps the user's own settings for it).
// "Through quiet hours" is the product's rule on the server (the lane decides the delivery
// time), not the device's Do Not Disturb, which the app never asks to bypass. Push delivery
// itself waits for the store setup (`notifications.push` deferred); these are its channels.

package com.voysemble.app.ui

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import com.voysemble.core.i18n.Txt
import com.voysemble.core.i18n.tr

object NotificationChannels {
    const val PRIORITY = "lane.priority"
    const val NORMAL = "lane.normal"
    const val DIGEST = "lane.digest"

    /** Creates or refreshes the three channels; names and descriptions in the app's language. */
    fun ensure(context: Context) {
        val manager = context.getSystemService(NotificationManager::class.java) ?: return
        manager.createNotificationChannels(
            listOf(
                NotificationChannel(PRIORITY, tr(Txt.INBOX_LANE_PRIORITY), NotificationManager.IMPORTANCE_HIGH).apply {
                    description = tr(Txt.INBOX_CHANNEL_PRIORITY)
                },
                NotificationChannel(NORMAL, tr(Txt.INBOX_LANE_NORMAL), NotificationManager.IMPORTANCE_DEFAULT).apply {
                    description = tr(Txt.INBOX_CHANNEL_NORMAL)
                },
                NotificationChannel(DIGEST, tr(Txt.INBOX_LANE_DIGEST), NotificationManager.IMPORTANCE_LOW).apply {
                    description = tr(Txt.INBOX_CHANNEL_DIGEST)
                },
            ),
        )
    }
}
