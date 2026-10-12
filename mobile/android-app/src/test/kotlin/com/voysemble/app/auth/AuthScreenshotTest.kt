// Copyright 2026- At Day. All rights reserved.
// Visual evidence for sign-in (atlas #2) and join-a-trip (atlas #3). Pure state in, no network.

package com.voysemble.app.auth

import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onRoot
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.github.takahirom.roborazzi.captureRoboImage
import com.voysemble.app.session.SessionUiState
import com.voysemble.app.ui.VoysembleTheme
import com.voysemble.core.session.SessionState
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

private const val OUT = "../../docs/captures/android"

@RunWith(AndroidJUnit4::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [35], qualifiers = "w412dp-h915dp-normal-long-notround-any-420dpi-keyshidden-nonav")
class AuthScreenshotTest {
    @get:Rule
    val compose = createComposeRule()

    @Test
    fun sign_in_light() {
        compose.setContent {
            VoysembleTheme(darkTheme = false) {
                SignInScreen(SessionUiState(SessionState.SignedOut), onRequestLink = {}, onVerify = {}, onBrowseSample = {}, onStartOver = {})
            }
        }
        compose.onNodeWithText("Email me a link").assertExists()
        compose.onRoot().captureRoboImage("$OUT/sign-in.png")
    }

    @Test
    fun sign_in_awaiting_link_with_error_dark() {
        compose.setContent {
            VoysembleTheme(darkTheme = true) {
                SignInScreen(
                    SessionUiState(SessionState.AwaitingLink("minji@example.com"), error = "This link does not work any more. Request a new one."),
                    onRequestLink = {}, onVerify = {}, onBrowseSample = {}, onStartOver = {},
                )
            }
        }
        compose.onNodeWithText("Check your email").assertExists()
        compose.onRoot().captureRoboImage("$OUT/sign-in-awaiting-dark.png")
    }

    @Test
    fun sign_in_after_revocation_light() {
        // Slice 031 (D28): the organizer revoked this phone; the screen says why.
        compose.setContent {
            VoysembleTheme(darkTheme = false) {
                SignInScreen(SessionUiState(SessionState.SignedOut, revokedNotice = true), onRequestLink = {}, onVerify = {}, onBrowseSample = {}, onStartOver = {})
            }
        }
        compose.onNodeWithText("This phone's access was revoked by the organizer. Sign in again and enter the new invite code they give you.").assertExists()
        compose.onRoot().captureRoboImage("$OUT/sign-in-revoked.png")
    }

    @Test
    fun invite_light() {
        compose.setContent {
            VoysembleTheme(darkTheme = false) {
                InviteScreen(SessionUiState(SessionState.NeedsInvite("acc", "minji@example.com")), onRedeem = {}, onSignOut = {})
            }
        }
        compose.onNodeWithText("Join trip").assertExists()
        compose.onRoot().captureRoboImage("$OUT/invite.png")
    }
}
