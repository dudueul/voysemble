// Copyright 2026- At Day. All rights reserved.
// Facts (D29, slice 053): the three lane channels exist after launch with their importance, named
// in the app's language; a second launch changes nothing.

package com.voysemble.app.ui

import android.app.NotificationManager
import android.content.Context
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.voysemble.core.i18n.AppLocale
import org.junit.After
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import kotlin.test.assertEquals

@RunWith(AndroidJUnit4::class)
@Config(sdk = [35])
class NotificationChannelsTest {
    @After fun reset() {
        AppLocale.current = "en"
    }

    @Test
    fun three_channels_one_per_lane() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        NotificationChannels.ensure(context)
        NotificationChannels.ensure(context)
        val manager = context.getSystemService(NotificationManager::class.java)
        val byId = manager.notificationChannels.associateBy { it.id }
        assertEquals(setOf(NotificationChannels.PRIORITY, NotificationChannels.NORMAL, NotificationChannels.DIGEST), byId.keys)
        assertEquals(NotificationManager.IMPORTANCE_HIGH, byId.getValue(NotificationChannels.PRIORITY).importance)
        assertEquals(NotificationManager.IMPORTANCE_DEFAULT, byId.getValue(NotificationChannels.NORMAL).importance)
        assertEquals(NotificationManager.IMPORTANCE_LOW, byId.getValue(NotificationChannels.DIGEST).importance)
        assertEquals("Priority", byId.getValue(NotificationChannels.PRIORITY).name.toString())
        assertEquals("The once-a-day summary.", byId.getValue(NotificationChannels.DIGEST).description)
    }
}
