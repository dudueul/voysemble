// Copyright 2026- At Day. All rights reserved.
// The Android image bits behind the Memories tab (D34): decode bytes to a Compose bitmap, and
// prepare a picked image for upload. The original is re-encoded as JPEG with its longest edge at
// most 2048 px (which also leaves EXIF and HEIC behind on the device and bounds the size), and
// the thumbnail is the same image at 320 px, so the server's same-type check passes. Bounds-only
// decoding first, then a sampled decode, so a 12 MB camera file never sits in memory twice. Null
// means "cannot decode": the server then sees the raw bytes and refuses what it does not know.

package com.voysemble.app.memories

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import java.io.ByteArrayOutputStream

/** An upload ready to go: both renditions as JPEG. */
class PreparedImage(val original: ByteArray, val thumbnail: ByteArray, val contentType: String = "image/jpeg")

object AndroidImages {
    const val ORIGINAL_EDGE = 2048
    const val THUMBNAIL_EDGE = 320

    fun decode(bytes: ByteArray): ImageBitmap? =
        runCatching { BitmapFactory.decodeByteArray(bytes, 0, bytes.size)?.asImageBitmap() }.getOrNull()

    fun prepare(bytes: ByteArray): PreparedImage? = runCatching {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null
        var sample = 1
        while (maxOf(bounds.outWidth, bounds.outHeight) / (sample * 2) >= ORIGINAL_EDGE) sample *= 2
        val decoded = BitmapFactory.decodeByteArray(bytes, 0, bytes.size, BitmapFactory.Options().apply { inSampleSize = sample }) ?: return null
        val original = fit(decoded, ORIGINAL_EDGE)
        val thumbnail = fit(original, THUMBNAIL_EDGE)
        PreparedImage(jpeg(original, 90) ?: return null, jpeg(thumbnail, 85) ?: return null)
    }.getOrNull()

    private fun fit(bitmap: Bitmap, edge: Int): Bitmap {
        val scale = minOf(1f, edge.toFloat() / maxOf(bitmap.width, bitmap.height))
        val w = maxOf(1, (bitmap.width * scale).toInt())
        val h = maxOf(1, (bitmap.height * scale).toInt())
        return if (w == bitmap.width && h == bitmap.height) bitmap else Bitmap.createScaledBitmap(bitmap, w, h, true)
    }

    private fun jpeg(bitmap: Bitmap, quality: Int): ByteArray? {
        val out = ByteArrayOutputStream()
        return if (bitmap.compress(Bitmap.CompressFormat.JPEG, quality, out)) out.toByteArray() else null
    }
}
