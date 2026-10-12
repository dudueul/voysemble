// Copyright 2026- At Day. All rights reserved.
//
// Bytes across the Swift boundary (slice 044): photo originals and thumbnails travel as
// `ByteArray` in `PhotoUpload` and come back from `ApiClient.photoBytes`; Swift holds `Data`.
// One memcpy each way instead of a per-byte loop over a camera file. Plain functions (not
// extensions) so Swift sees them as `DataBridgeKt.bytesOf(data:)` and `DataBridgeKt.dataOf(bytes:)`.

package com.voysemble.core.api

import kotlinx.cinterop.BetaInteropApi
import kotlinx.cinterop.ExperimentalForeignApi
import kotlinx.cinterop.addressOf
import kotlinx.cinterop.usePinned
import platform.Foundation.NSData
import platform.Foundation.create
import platform.posix.memcpy

@OptIn(ExperimentalForeignApi::class)
public fun bytesOf(data: NSData): ByteArray {
    val out = ByteArray(data.length.toInt())
    if (out.isNotEmpty()) out.usePinned { pinned -> memcpy(pinned.addressOf(0), data.bytes, data.length) }
    return out
}

@OptIn(ExperimentalForeignApi::class, BetaInteropApi::class)
public fun dataOf(bytes: ByteArray): NSData {
    if (bytes.isEmpty()) return NSData()
    return bytes.usePinned { pinned -> NSData.create(bytes = pinned.addressOf(0), length = bytes.size.toULong()) }
}
