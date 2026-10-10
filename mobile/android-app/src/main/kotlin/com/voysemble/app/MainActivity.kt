// Copyright 2026- At Day. All rights reserved.
// Single-activity host. Navigation and real screens arrive in P1/P2 slices.

package com.voysemble.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.lifecycle.viewmodel.compose.viewModel
import com.voysemble.app.today.TodayPlaceholderScreen
import com.voysemble.app.today.TodayPlaceholderViewModel
import com.voysemble.app.ui.VoysembleTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            VoysembleTheme {
                val vm: TodayPlaceholderViewModel = viewModel(factory = TodayPlaceholderViewModel.factory(BuildConfig.API_HOST))
                TodayPlaceholderScreen(vm)
            }
        }
    }
}
