// Copyright 2026- At Day. All rights reserved.
// Convention: Android application with Compose and built-in Kotlin (AGP 9: no kotlin-android
// plugin). Module-specific config stays in android-app/build.gradle.kts. Lives in build-logic-android, included only when
// voysemble.android=true. Unverified on a host with Google Maven as of 2026-10-10.

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.plugin.compose")
}
