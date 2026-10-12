// Copyright 2026- At Day. All rights reserved.
//
// In-app routing without a navigation library. The session state (core SessionManager) decides
// the top level: sign-in, invite, or the app; "sample mode" shows the fixture app without an
// account. Inside the app: tabs from the Today screen plus two pushed leader and traveler
// screens (and the Chats tab since slice 033). A real back stack and deep links arrive later.

package com.voysemble.app

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.voysemble.app.auth.InviteScreen
import com.voysemble.app.auth.SignInScreen
import com.voysemble.app.bulletin.BulletinRoute
import com.voysemble.app.bulletin.BulletinViewModel
import com.voysemble.app.chat.ChatsRoute
import com.voysemble.app.chat.ChatsViewModel
import com.voysemble.app.headcount.HeadcountRoute
import com.voysemble.app.headcount.HeadcountViewModel
import com.voysemble.app.incidents.IncidentsRoute
import com.voysemble.app.incidents.IncidentsViewModel
import com.voysemble.app.session.AppGraph
import com.voysemble.app.session.PendingLink
import com.voysemble.app.session.SessionViewModel
import com.voysemble.app.today.MainTab
import com.voysemble.app.today.TodayRoute
import com.voysemble.app.today.TodayViewModel
import com.voysemble.app.window.AndroidLocationSource
import com.voysemble.app.window.MeetingWindowRoute
import com.voysemble.app.window.MeetingWindowViewModel
import com.voysemble.core.session.ActiveTrip
import com.voysemble.core.session.SessionState
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update

enum class Screen { MAIN, HEADCOUNT, WINDOW, INCIDENTS }

class NavViewModel : ViewModel() {
    private val _screen = MutableStateFlow(Screen.MAIN)
    val screen: StateFlow<Screen> = _screen
    fun open(s: Screen) = _screen.update { s }
    fun back() = _screen.update { Screen.MAIN }
}

@Composable
fun AppRoot() {
    val sessionVm: SessionViewModel = viewModel { SessionViewModel(AppGraph.sessionManager) }
    val s by sessionVm.state.collectAsStateWithLifecycle()
    // App Links (slice 019): a magic link that opened the app verifies itself, once.
    val pendingLink by PendingLink.link.collectAsStateWithLifecycle()
    LaunchedEffect(pendingLink) {
        val link = pendingLink ?: return@LaunchedEffect
        PendingLink.consume()
        if (s.session !is SessionState.Ready) sessionVm.verify(link)
    }
    when (val session = s.session) {
        is SessionState.Ready -> AppScreens(trip = session.trip, onSignOut = sessionVm::signOut)
        is SessionState.NeedsInvite -> InviteScreen(state = s, onRedeem = sessionVm::redeem, onSignOut = sessionVm::signOut)
        else -> if (s.sampleMode) {
            BackHandler { sessionVm.leaveSampleMode() }
            AppScreens(trip = null, onSignOut = sessionVm::leaveSampleMode)
        } else {
            SignInScreen(
                state = s,
                onRequestLink = sessionVm::requestLink,
                onVerify = sessionVm::verify,
                onBrowseSample = sessionVm::enterSampleMode,
                onStartOver = sessionVm::signOut,
            )
        }
    }
}

/** The signed-in (or sample) app: tabs plus pushed screens. `trip == null` means sample mode. */
@Composable
fun AppScreens(trip: ActiveTrip?, onSignOut: () -> Unit) {
    val nav: NavViewModel = viewModel()
    val screen by nav.screen.collectAsStateWithLifecycle()
    val today: TodayViewModel = viewModel(key = "today-${trip?.tripId ?: "sample"}") {
        if (trip == null) TodayViewModel() else TodayViewModel(api = AppGraph.apiClient, trip = trip)
    }
    val todayState by today.state.collectAsStateWithLifecycle()
    when (screen) {
        Screen.HEADCOUNT -> {
            BackHandler { nav.back() }
            // Live when signed in on a trip; the fixture otherwise. Keyed so switching trips restarts.
            val vm: HeadcountViewModel = viewModel(key = trip?.tripId ?: "sample") {
                if (trip == null) HeadcountViewModel() else HeadcountViewModel(AppGraph.apiClient, trip, deviceClock = { HeadcountViewModel.deviceClockNow() })
            }
            HeadcountRoute(vm, onBack = nav::back)
        }
        Screen.WINDOW -> {
            BackHandler { nav.back() }
            // Live when signed in on a trip (slice 029): the window from the API, the fix judged on the device.
            val appContext = LocalContext.current.applicationContext
            val vm: MeetingWindowViewModel = viewModel(key = "window-${trip?.tripId ?: "sample"}") {
                if (trip == null) {
                    MeetingWindowViewModel()
                } else {
                    MeetingWindowViewModel(AppGraph.apiClient, trip, AndroidLocationSource(appContext), deviceClock = { MeetingWindowViewModel.deviceClockNow() })
                }
            }
            MeetingWindowRoute(vm, onBack = nav::back)
        }
        Screen.INCIDENTS -> {
            BackHandler { nav.back() }
            val vm: IncidentsViewModel = viewModel(key = "incidents-${trip?.tripId ?: "sample"}") {
                if (trip == null) IncidentsViewModel() else IncidentsViewModel(AppGraph.apiClient, trip, deviceClock = { IncidentsViewModel.deviceClockNow() })
            }
            IncidentsRoute(vm, onBack = nav::back)
        }
        Screen.MAIN -> when (todayState.tab) {
            MainTab.TODAY -> TodayRoute(today, onOpenHeadcount = { nav.open(Screen.HEADCOUNT) }, onOpenWindow = { nav.open(Screen.WINDOW) }, onOpenIncidents = { nav.open(Screen.INCIDENTS) })
            MainTab.BULLETIN -> TabHost(today) {
                val vm: BulletinViewModel = viewModel(key = trip?.tripId ?: "sample") {
                    if (trip == null) BulletinViewModel() else BulletinViewModel(AppGraph.apiClient, trip)
                }
                BulletinRoute(vm, tripName = trip?.tripName, onSignOut = onSignOut)
            }
            MainTab.CHATS -> TabHost(today) {
                // Slice 033 (D22): fixed channels; live when signed in on a trip, the fixture otherwise.
                val vm: ChatsViewModel = viewModel(key = "chats-${trip?.tripId ?: "sample"}") {
                    if (trip == null) ChatsViewModel() else ChatsViewModel(AppGraph.apiClient, trip)
                }
                ChatsRoute(vm)
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
