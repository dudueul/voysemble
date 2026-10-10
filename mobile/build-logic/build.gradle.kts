// Copyright 2026- At Day. All rights reserved.
//
// Convention plugins for the mobile workspace. Why an included build: Gradle script plugins
// (`apply(from = ...)`) compile against their own classpath and cannot see KGP or AGP classes,
// so Android configuration must live in a precompiled plugin. Android-dependent plugins sit in
// src/android/kotlin and are compiled only when voysemble.android=true, which keeps hosts without
// Google Maven (some sandboxes) able to build `core` and run its JVM tests.

import java.util.Properties

plugins {
    `kotlin-dsl`
}

/** Toggle sources, in order: -P on the command line, root gradle.properties, default true. */
val withAndroid: Boolean = run {
    val fromCli = gradle.startParameter.projectProperties["voysemble.android"]
    val fromProps = providers.gradleProperty("voysemble.android").orNull
    val fromFile: String? = runCatching {
        val props = Properties()
        file("../gradle.properties").inputStream().use { props.load(it) }
        props.getProperty("voysemble.android")
    }.getOrNull()
    (fromCli ?: fromProps ?: fromFile ?: "true").toBoolean()
}

logger.lifecycle("build-logic: voysemble.android=$withAndroid")

if (withAndroid) {
    sourceSets.named("main") { kotlin.srcDir("src/android/kotlin") }
}

dependencies {
    implementation(libs.kotlin.gradlePlugin)
    implementation(libs.kotlin.serializationPlugin)
    implementation(libs.kotlin.composeCompilerPlugin)
    implementation(libs.skie.gradlePlugin)
    if (withAndroid) implementation(libs.android.gradlePlugin)
}
