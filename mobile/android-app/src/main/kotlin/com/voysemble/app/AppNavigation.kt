// Copyright 2026- At Day. All rights reserved.
//
// In-app routing without a navigation library: tabs from the Today screen plus two pushed leader
// and traveler screens (head count, meeting window). State lives in a ViewModel so rotation
// keeps the place. A real back stack and deep links arrive with the sync slice.

package com.voysemble.app

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.voysemble.app.bulletin.BulletinRoute
import com.voysemble.app.bulletin.BulletinViewModel
import com.voysemble.app.headcount.HeadcountRoute
import com.voysemble.app.headcount.HeadcountViewModel
import com.voysemble.app.today.MainTab
import com.voysemble.app.today.TodayRoute
import com.voysemble.app.today.TodayViewModel
import com.voysemble.app.window.MeetingWindowRoute
import com.voysemble.app.window.MeetingWindowViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update

enum class Screen { MAIN, HEADCOUNT, WINDOW }

class NavViewModel : ViewModel() {
    private val _screen = MutableStateFlow(Screen.MAIN)
    val screen: StateFlow<Screen> = _screen
    fun open(s: Screen) = _screen.update { s }
    fun back() = _screen.update { Screen.MAIN }
}

@Composable
fun AppRoot() {
    val nav: NavViewModel = viewModel()
    val screen by nav.screen.collectAsStateWithLifecycle()
    val today: TodayViewModel = viewModel()
    val todayState by today.state.collectAsStateWithLifecycle()
    when (screen) {
        Screen.HEADCOUNT -> {
            BackHandler { nav.back() }
            val vm: HeadcountViewModel = viewModel()
            HeadcountRoute(vm, onBack = nav::back)
        }
        Screen.WINDOW -> {
            BackHandler { nav.back() }
            val vm: MeetingWindowViewModel = viewModel()
            MeetingWindowRoute(vm, onBack = nav::back)
        }
        Screen.MAIN -> when (todayState.tab) {
            MainTab.TODAY -> TodayRoute(today, onOpenHeadcount = { nav.open(Screen.HEADCOUNT) }, onOpenWindow = { nav.open(Screen.WINDOW) })
            MainTab.BULLETIN -> TabHost(today) {
                val vm: BulletinViewModel = viewModel()
                BulletinRoute(vm)
            }
            else -> TabHost(today) { NotBuilt(todayState.tab.name.lowercase().replaceFirstChar { it.uppercase() }) }
        }
    }
}

/** Non-Today tabs keep the same bottom bar; the Today screen owns the bar composable. */
@Composable
private fun TabHost(today: TodayViewModel, content: @Composable () -> Unit) {
    val state by today.state.collectAsStateWithLifecycle()
    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        bottomBar = { com.voysemble.app.today.BottomTabs(selected = state.tab, onSelect = today::selectTab) },
    ) { padding -> Box(Modifier.fillMaxSize().padding(padding)) { content() } }
}

@Composable
private fun NotBuilt(name: String) {
    Box(Modifier.fillMaxSize().padding(24.dp), contentAlignment = Alignment.Center) {
        Text("$name is not built yet. Status in feature-status.json is \"deferred\".", style = MaterialTheme.typography.bodyLarge)
    }
}
