// Copyright 2026- At Day. All rights reserved.
// Single-activity host. Routing lives in AppNavigation.kt. App Links (slice 019): a magic link
// that opens the app arrives here as intent data, at launch or while running (singleTop), and is
// handed to the session through PendingLink.

package com.voysemble.app

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import com.voysemble.app.session.AppGraph
import com.voysemble.app.session.PendingLink
import com.voysemble.app.session.magicLinkFrom
import com.voysemble.app.ui.VoysembleTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        AppGraph.init(applicationContext)
        PendingLink.offer(magicLinkFrom(intent))
        enableEdgeToEdge()
        setContent {
            VoysembleTheme { AppRoot() }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        PendingLink.offer(magicLinkFrom(intent))
    }
}
