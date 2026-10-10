// Copyright 2026- At Day. All rights reserved.
// Convention: Kotlin Multiplatform library with serialization and SKIE. Targets are declared by
// the module itself (core/build.gradle.kts) so this stays a thin, host-independent base.

plugins {
    id("org.jetbrains.kotlin.multiplatform")
    id("org.jetbrains.kotlin.plugin.serialization")
    // SKIE: Swift-friendly sealed interfaces (onEnum(of:)) and async suspend bridging. Apple-only effect.
    id("co.touchlab.skie")
}

kotlin {
    jvmToolchain(21)
}
