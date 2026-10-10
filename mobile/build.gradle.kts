// Copyright 2026- At Day. All rights reserved.
//
// Root build. All Gradle plugins (Kotlin, serialization, Compose compiler, SKIE, and, when
// voysemble.android=true, the Android Gradle Plugin) are placed on the root buildscript classpath.
// Modules then apply them by id without versions. This is deliberate: script plugins applied with
// `apply(from = ...)` (core/android-target.gradle.kts) only see the root buildscript classpath, so
// a `plugins {}` block in a module would not make AGP/KGP classes visible to them.
// AGP lives on Google Maven, which some build hosts cannot reach; the toggle keeps those hosts
// building core and its JVM tests.

val withAndroid = providers.gradleProperty("voysemble.android").map(String::toBoolean).getOrElse(true)

buildscript {
    val withAndroid = providers.gradleProperty("voysemble.android").map(String::toBoolean).getOrElse(true)
    repositories {
        mavenCentral()
        gradlePluginPortal()
        if (withAndroid) google()
    }
    dependencies {
        classpath(libs.kotlin.gradlePlugin)
        classpath(libs.kotlin.serializationPlugin)
        classpath(libs.kotlin.composeCompilerPlugin)
        classpath(libs.skie.gradlePlugin)
        if (withAndroid) classpath(libs.android.gradlePlugin)
    }
}

// Surface the toggle in logs so CI output states which configuration ran.
logger.lifecycle("voysemble.android=$withAndroid")
