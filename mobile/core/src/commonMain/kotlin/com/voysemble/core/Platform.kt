// Copyright 2026- At Day. All rights reserved.
// Platform identity for User-Agent and diagnostics. expect/actual per target.

package com.voysemble.core

public expect val platformName: String

public const val CORE_VERSION: String = "0.0.1"

public fun defaultUserAgent(): String = "Voysemble/$CORE_VERSION ($platformName)"
