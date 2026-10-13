// Copyright 2026- At Day. All rights reserved.
//
// The phone's half of push (D29, slice 088). The platform hands over the token its push service
// gave it (APNs device token as hex, FCM registration token); this registers it for the signed-in
// session once and remembers it, so an unchanged token on the next launch costs no call. A new
// token (reinstall, rotation) registers again. Turning notifications off removes it. Sign-out and
// wipe forget the remembered token with the session (SessionManager.clear); the server drops the
// device with the session at logout and never pushes to a revoked one.

package com.voysemble.core.notifications

import com.voysemble.core.api.ApiClient
import com.voysemble.core.api.ApiResult
import com.voysemble.core.api.RegisterPushDeviceRequestDto
import com.voysemble.core.session.SecureStore
import com.voysemble.core.session.SessionManager

public class PushRegistrar(
    private val api: ApiClient,
    private val store: SecureStore,
) {
    /** The token the server holds for this session, or null. */
    public fun registeredToken(): String? = store.get(KEY)

    /**
     * Registers `token` for this session unless it is already the registered one. `platform` is
     * "ios" or "android"; `apnsEnvironment` is "sandbox" or "production" on iOS and null on Android.
     * Answers "registered", "unchanged", "signed-out" or "failed" (String so Swift reads it plainly).
     */
    public suspend fun register(platform: String, token: String, apnsEnvironment: String?): String {
        if (store.get(SessionManager.KEY_TOKEN) == null) return SIGNED_OUT
        if (token.isBlank()) return FAILED
        if (store.get(KEY) == token) return UNCHANGED
        val body = RegisterPushDeviceRequestDto(platform, token, if (platform == "ios") apnsEnvironment else null)
        return when (api.registerPushDevice(body)) {
            is ApiResult.Ok -> { store.put(KEY, token); REGISTERED }
            is ApiResult.Failed, is ApiResult.Unreachable -> FAILED
        }
    }

    /** Notifications turned off: the server forgets this session's device. Answers "removed" or "failed". */
    public suspend fun unregister(): String {
        if (store.get(SessionManager.KEY_TOKEN) == null) { store.put(KEY, null); return SIGNED_OUT }
        return when (api.unregisterPushDevice()) {
            is ApiResult.Ok -> { store.put(KEY, null); REMOVED }
            is ApiResult.Failed, is ApiResult.Unreachable -> FAILED
        }
    }

    public companion object {
        public const val KEY: String = "push.token"
        public const val REGISTERED: String = "registered"
        public const val UNCHANGED: String = "unchanged"
        public const val REMOVED: String = "removed"
        public const val SIGNED_OUT: String = "signed-out"
        public const val FAILED: String = "failed"
    }
}
