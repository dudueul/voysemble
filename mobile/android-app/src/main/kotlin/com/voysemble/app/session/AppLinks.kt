// Copyright 2026- At Day. All rights reserved.
// App Links (slice 019): the magic link `https://<host>/auth/verify#token=…` arrives as the
// activity's intent data. Only that path is accepted; the token itself is parsed by core
// (`extractMagicToken`) so the same rule serves the paste flow and the link flow.

package com.voysemble.app.session

import android.content.Intent
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

/** The magic link as text when `data` is one, else null. Pure, so it is unit-tested. */
fun magicLinkFrom(data: String?): String? {
    if (data == null) return null
    val path = data.substringAfter("://", "").substringAfter('/', "").substringBefore('#').substringBefore('?')
    return if (data.startsWith("https://") && path == "auth/verify" && data.contains("token=")) data else null
}

fun magicLinkFrom(intent: Intent?): String? = magicLinkFrom(intent?.dataString)

/** Hand-off from the activity (which sees intents) to the root composable (which owns the session). */
object PendingLink {
    private val _link = MutableStateFlow<String?>(null)
    val link: StateFlow<String?> = _link
    fun offer(link: String?) { if (link != null) _link.value = link }
    fun consume() { _link.value = null }
}
