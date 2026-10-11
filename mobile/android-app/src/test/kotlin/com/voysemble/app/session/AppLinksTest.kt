// Copyright 2026- At Day. All rights reserved.
// Facts: only an https link on /auth/verify carrying a token is a magic link; other paths,
// schemes, and missing tokens are ignored; the pending hand-off offers once and consumes.

package com.voysemble.app.session

import kotlin.test.assertEquals
import kotlin.test.assertNull
import org.junit.Test

class AppLinksTest {
    @Test
    fun accepts_only_the_verify_path_with_a_token() {
        val link = "https://next.dev.voysemble.cfd/auth/verify#token=" + "a".repeat(40)
        assertEquals(link, magicLinkFrom(link))
        val prod = "https://app.voysemble.com/auth/verify#token=" + "b".repeat(40)
        assertEquals(prod, magicLinkFrom(prod))
        assertNull(magicLinkFrom("https://next.dev.voysemble.cfd/safety"))
        assertNull(magicLinkFrom("http://next.dev.voysemble.cfd/auth/verify#token=" + "a".repeat(40)))
        assertNull(magicLinkFrom("https://next.dev.voysemble.cfd/auth/verify"))
        assertNull(magicLinkFrom(null as String?))
    }

    @Test
    fun pending_link_offers_then_consumes() {
        PendingLink.offer(null)
        assertNull(PendingLink.link.value)
        PendingLink.offer("https://app.voysemble.com/auth/verify#token=" + "c".repeat(40))
        assertEquals(true, PendingLink.link.value?.contains("token="))
        PendingLink.consume()
        assertNull(PendingLink.link.value)
    }
}
