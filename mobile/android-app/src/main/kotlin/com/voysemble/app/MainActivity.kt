// Copyright 2026- At Day. All rights reserved.
// Single-activity host. Tabs other than Today arrive in later slices.

package com.voysemble.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.lifecycle.viewmodel.compose.viewModel
import com.voysemble.app.today.TodayRoute
import com.voysemble.app.today.TodayViewModel
import com.voysemble.app.ui.VoysembleTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            VoysembleTheme {
                val vm: TodayViewModel = viewModel()
                TodayRoute(vm)
            }
        }
    }
}
