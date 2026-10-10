// Copyright 2026- At Day. All rights reserved.
// Stroke icons shared with the web console (apps/organizer-web/src/app/shell/icons.tsx): same
// 24x24 path data, built as ImageVectors. No icon library dependency.

package com.voysemble.app.ui

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.PathParser
import androidx.compose.ui.unit.dp

private fun stroke(name: String, vararg paths: String): ImageVector {
    val b = ImageVector.Builder(name = name, defaultWidth = 24.dp, defaultHeight = 24.dp, viewportWidth = 24f, viewportHeight = 24f)
    for (d in paths) {
        b.addPath(
            pathData = PathParser().parsePathString(d).toNodes(),
            fill = null,
            stroke = SolidColor(Color.Black),
            strokeLineWidth = 1.8f,
            strokeLineCap = StrokeCap.Round,
            strokeLineJoin = StrokeJoin.Round,
        )
    }
    return b.build()
}

object AppIcons {
    val Today: ImageVector by lazy { stroke("today", "M6 5h12a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3z", "M3 10h18M8 3v4M16 3v4") }
    val Plan: ImageVector by lazy { stroke("plan", "M5 4h11l3 3v13H5z", "M8 10h8M8 14h8M8 18h5") }
    val Bulletin: ImageVector by lazy { stroke("bulletin", "M6 16V11a6 6 0 1 1 12 0v5l2 2H4z", "M10 21h4") }
    val Chat: ImageVector by lazy { stroke("chat", "M4 5h16v11H9l-5 4z") }
    val Memories: ImageVector by lazy { stroke("memories", "M3 5h18v14H3z", "M9 10m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0", "M21 16l-5-5-8 8") }
    val Plane: ImageVector by lazy { stroke("plane", "M2.5 12.5l19-8-5 17-4-7z", "M12.5 14.5l9-10") }
    val Bus: ImageVector by lazy { stroke("bus", "M7 4h10a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3z", "M4 11h16M8 18v2M16 18v2M8 14.5h0.01M16 14.5h0.01") }
    val Meal: ImageVector by lazy { stroke("meal", "M6 3v8M9 3v8M7.5 11v10M17 3c-2 1-3 3-3 6v12M17 3v18") }
    val Pin: ImageVector by lazy { stroke("pin", "M12 21s-6-5.3-6-11a6 6 0 1 1 12 0c0 5.7-6 11-6 11z", "M12 10m-2.2 0a2.2 2.2 0 1 0 4.4 0a2.2 2.2 0 1 0-4.4 0") }
    val Hotel: ImageVector by lazy { stroke("hotel", "M3 21V7l9-4 9 4v14", "M9 21v-5h6v5M9 11h0.01M15 11h0.01M12 11h0.01") }
    val Flag: ImageVector by lazy { stroke("flag", "M5 21V4h12l-2 4 2 4H5") }
    val Check: ImageVector by lazy { stroke("check", "M5 12l4 4L19 7") }
    val Offline: ImageVector by lazy { stroke("offline", "M3 3l18 18M8.5 8.6A9 9 0 0 0 2.5 12M5.5 15.5a5 5 0 0 1 10.4-1.6M12 19h0.01M21.5 12a9 9 0 0 0-5.4-3.2") }
    val Sync: ImageVector by lazy { stroke("sync", "M20 12a8 8 0 0 1-14.9 4M4 12a8 8 0 0 1 14.9-4", "M4 16v4h4M20 8V4h-4") }
    val Map: ImageVector by lazy { stroke("map", "M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z", "M9 4v14M15 6v14") }
    val Clock: ImageVector by lazy { stroke("clock", "M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0-18 0", "M12 7v5l3 2") }
}
