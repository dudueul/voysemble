// Copyright 2026- At Day. All rights reserved.
//
// Notification inbox wire types (mirror of packages/contracts/src/notifications.ts; D29, slice
// 053). A phone reads its own inbox (`GET .../notifications/mine`: what the lanes have delivered
// by now, newest first) and marks one row read (`POST .../notifications/{id}/read`). The lane and
// the delivery time are the server's facts; the phone only shows and reads.

package com.voysemble.core.api

import kotlinx.serialization.Serializable

@Serializable
public data class NotificationDto(
    val id: String,
    val tripId: String,
    /** priority | normal | digest */
    val lane: String,
    /** announcement | itinerary_revision | headcount_call | incident_status | proposal_decided */
    val kind: String,
    val title: String,
    val body: String,
    /** announcement | headcount | incident | proposal */
    val refType: String,
    val refId: String,
    val createdAt: String,
    /** When the lane delivered it (ISO instant). */
    val deliverAt: String,
    val readAt: String? = null,
)

@Serializable
public data class MyNotificationsDto(
    val notifications: List<NotificationDto>,
    val unread: Int,
)
