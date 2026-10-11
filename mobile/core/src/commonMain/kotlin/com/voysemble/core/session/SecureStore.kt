// Copyright 2026- At Day. All rights reserved.
//
// Small key-value secret store the session layer writes the native session token into.
// Platform implementations: Android Keystore-wrapped SharedPreferences (android-app), iOS
// Keychain (ios-app). Tests use InMemorySecureStore. Values are opaque strings; the store never
// interprets them and never logs them.

package com.voysemble.core.session

public interface SecureStore {
    public fun get(key: String): String?
    public fun put(key: String, value: String?)
}

public class InMemorySecureStore : SecureStore {
    private val map = mutableMapOf<String, String>()
    override fun get(key: String): String? = map[key]
    override fun put(key: String, value: String?) {
        if (value == null) map.remove(key) else map[key] = value
    }
}
