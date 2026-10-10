// Copyright 2026- At Day. All rights reserved.
// Gives Swift a Ktor engine without exposing Ktor types across the framework boundary.

package com.voysemble.core

import io.ktor.client.engine.HttpClientEngine
import io.ktor.client.engine.darwin.Darwin

public object DarwinEngineFactory {
    public fun create(): HttpClientEngine = Darwin.create()
}
