// Copyright 2026- At Day. All rights reserved.
// Android convention plugins (AGP 9, built-in Kotlin). Compiled only on hosts with Google Maven.
// Unverified on such a host as of 2026-10-10; the CI `mobile` job is the first verification.

plugins {
    `kotlin-dsl`
}

dependencies {
    implementation(libs.kotlin.gradlePlugin)
    implementation(libs.kotlin.composeCompilerPlugin)
    implementation(libs.android.gradlePlugin)
    implementation(libs.roborazzi.gradlePlugin)
}
