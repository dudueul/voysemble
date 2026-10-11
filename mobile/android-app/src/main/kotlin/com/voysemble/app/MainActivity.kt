// Copyright 2026- At Day. All rights reserved.
// Single-activity host. Routing lives in AppNavigation.kt.

package com.voysemble.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import com.voysemble.app.session.AppGraph
import com.voysemble.app.ui.VoysembleTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        AppGraph.init(applicationContext)
        enableEdgeToEdge()
        setContent {
            VoysembleTheme { AppRoot() }
        }
    }
}
