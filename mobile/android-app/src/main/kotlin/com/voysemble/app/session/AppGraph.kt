// Copyright 2026- At Day. All rights reserved.
// Process-wide wiring: one ApiClient against BuildConfig.API_HOST, one SessionManager over the
// Keystore store. ViewModels take these as constructor parameters so tests inject fakes.

package com.voysemble.app.session

import android.content.Context
import com.voysemble.app.BuildConfig
import com.voysemble.core.api.ApiClient
import com.voysemble.core.api.ApiClientConfig
import com.voysemble.core.session.SecureStore
import com.voysemble.core.session.SessionManager
import io.ktor.client.engine.okhttp.OkHttp

object AppGraph {
    @Volatile private var store: SecureStore? = null
    @Volatile private var api: ApiClient? = null
    @Volatile private var session: SessionManager? = null

    fun init(context: Context) {
        if (session != null) return
        val s = KeystoreSecureStore(context)
        val a = ApiClient(
            ApiClientConfig(
                host = BuildConfig.API_HOST,
                userAgent = "Voysemble-Android/${BuildConfig.VERSION_NAME}",
                sessionToken = { s.get(SessionManager.KEY_TOKEN) },
            ),
            OkHttp.create(),
        )
        val m = SessionManager(a, s)
        // Lost or stolen device (D28): a wiped answer clears the session at once, mid-call.
        a.onWipe = { m.wipe() }
        store = s
        api = a
        session = m
    }

    val apiClient: ApiClient get() = api ?: error("AppGraph.init not called")
    val sessionManager: SessionManager get() = session ?: error("AppGraph.init not called")
}
