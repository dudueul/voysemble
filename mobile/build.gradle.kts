// Copyright 2026- At Day. All rights reserved.
//
// Root build. Kotlin plugins are declared here (plugin portal / Maven Central). The Android
// Gradle Plugin is put on the buildscript classpath only when `voysemble.android=true`, because
// it lives on Google Maven, which some build hosts cannot reach. Modules apply it by id.

val withAndroid = providers.gradleProperty("voysemble.android").map(String::toBoolean).getOrElse(true)

buildscript {
    val withAndroid = providers.gradleProperty("voysemble.android").map(String::toBoolean).getOrElse(true)
    repositories {
        mavenCentral()
        gradlePluginPortal()
        if (withAndroid) google()
    }
    dependencies {
        if (withAndroid) classpath(libs.android.gradlePlugin)
    }
}

plugins {
    alias(libs.plugins.kotlin.multiplatform) apply false
    alias(libs.plugins.kotlin.serialization) apply false
    alias(libs.plugins.kotlin.compose) apply false
}

// Surface the toggle in logs so CI output states which configuration ran.
logger.lifecycle("voysemble.android=$withAndroid")
