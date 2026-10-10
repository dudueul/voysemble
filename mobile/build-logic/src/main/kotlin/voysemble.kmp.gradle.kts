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

// Android target: provided by build-logic-android (on this plugin's classpath only when
// voysemble.android=true). Applied here rather than in the module so modules stay host-agnostic.
val withAndroid = providers.gradleProperty("voysemble.android").map(String::toBoolean).getOrElse(true)
if (withAndroid) {
    apply(plugin = "voysemble.kmp-android")
}
