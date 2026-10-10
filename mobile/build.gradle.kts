// Copyright 2026- At Day. All rights reserved.
// Root build. Plugins are provided by the included `build-logic` build.
//
// `voysemble.kmp` is requested here with `apply false` so the Kotlin Gradle Plugin (and, when
// voysemble.android=true, AGP via build-logic-android) load once in the root classloader. Without
// this, `core` and `android-app` each get their own copy and KGP's shared build service fails
// with "plugin applied to two sibling projects" (CI run 7, 2026-10-10).

plugins {
    id("voysemble.kmp") apply false
}

val withAndroid = providers.gradleProperty("voysemble.android").map(String::toBoolean).getOrElse(true)

// Surface the toggle in logs so CI output states which configuration ran.
logger.lifecycle("voysemble.android=$withAndroid")
