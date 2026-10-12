// Copyright 2026- At Day. All rights reserved.
package com.voysemble.core

public actual val platformName: String = "jvm"

public actual fun todayIsoDate(): String = java.time.LocalDate.now().toString()
