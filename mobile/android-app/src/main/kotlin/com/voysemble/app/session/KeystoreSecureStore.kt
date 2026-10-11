// Copyright 2026- At Day. All rights reserved.
//
// SecureStore backed by SharedPreferences with values encrypted under an AES-256-GCM key that
// lives in the Android Keystore (never exported, hardware-backed where available). D28: the
// session token is the only secret here; a remote wipe clears this store. No third-party
// dependency: ~60 lines beat a deprecated security-crypto artifact.

package com.voysemble.app.session

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import com.voysemble.core.session.SecureStore
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

class KeystoreSecureStore(context: Context) : SecureStore {
    private val prefs = context.applicationContext.getSharedPreferences("voysemble.secure", Context.MODE_PRIVATE)

    override fun get(key: String): String? {
        val packed = prefs.getString(key, null) ?: return null
        return try {
            val bytes = Base64.decode(packed, Base64.NO_WRAP)
            val iv = bytes.copyOfRange(0, IV_LEN)
            val ct = bytes.copyOfRange(IV_LEN, bytes.size)
            val cipher = Cipher.getInstance(TRANSFORM)
            cipher.init(Cipher.DECRYPT_MODE, secretKey(), GCMParameterSpec(TAG_BITS, iv))
            String(cipher.doFinal(ct), Charsets.UTF_8)
        } catch (_: Exception) {
            // A rotated or lost Keystore key makes old values unreadable: treat as signed out.
            prefs.edit().remove(key).apply()
            null
        }
    }

    override fun put(key: String, value: String?) {
        if (value == null) {
            prefs.edit().remove(key).apply()
            return
        }
        val cipher = Cipher.getInstance(TRANSFORM)
        cipher.init(Cipher.ENCRYPT_MODE, secretKey())
        val ct = cipher.doFinal(value.toByteArray(Charsets.UTF_8))
        val packed = Base64.encodeToString(cipher.iv + ct, Base64.NO_WRAP)
        prefs.edit().putString(key, packed).apply()
    }

    private fun secretKey(): SecretKey {
        val ks = KeyStore.getInstance(KEYSTORE).apply { load(null) }
        (ks.getKey(ALIAS, null) as? SecretKey)?.let { return it }
        val gen = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE)
        gen.init(
            KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build(),
        )
        return gen.generateKey()
    }

    private companion object {
        const val KEYSTORE = "AndroidKeyStore"
        const val ALIAS = "voysemble.session.v1"
        const val TRANSFORM = "AES/GCM/NoPadding"
        const val IV_LEN = 12
        const val TAG_BITS = 128
    }
}
