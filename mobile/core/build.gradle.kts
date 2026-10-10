// Copyright 2026- At Day. All rights reserved.
//
// `core`: Kotlin Multiplatform module shared by Android and iOS.
// Owns: API client (generated models later), auth/session, offline SQLite + sync engine,
// crypto, domain rules mirror. Must not: contain UI, platform permission prompts, or secrets.
// Targets: jvm (tests on any host), android (when voysemble.android=true), iosArm64 and
// iosSimulatorArm64 (compiled only on macOS; Gradle disables them elsewhere).

plugins {
    // Convention plugins from build-logic (KMP + serialization + SKIE).
    id("voysemble.kmp")
}

val withAndroid = providers.gradleProperty("voysemble.android").map(String::toBoolean).getOrElse(true)

kotlin {
    jvm()

    listOf(iosArm64(), iosSimulatorArm64()).forEach { target ->
        target.binaries.framework {
            baseName = "VoysembleCore"
            isStatic = true
        }
    }

    sourceSets {
        commonMain.dependencies {
            implementation(libs.kotlinx.coroutines.core)
            implementation(libs.kotlinx.serialization.json)
            implementation(libs.ktor.client.core)
            implementation(libs.ktor.client.content.negotiation)
            implementation(libs.ktor.serialization.kotlinx.json)
        }
        commonTest.dependencies {
            implementation(kotlin("test"))
            implementation(libs.kotlinx.coroutines.test)
            implementation(libs.ktor.client.mock)
        }
        jvmMain.dependencies {
            implementation(libs.ktor.client.cio)
        }
        iosMain.dependencies {
            implementation(libs.ktor.client.darwin)
        }
    }
}

// Android target and library configuration live in the `voysemble.kmp-android` convention plugin,
// which only exists when build-logic was compiled with voysemble.android=true.
if (withAndroid) {
    apply(plugin = "voysemble.kmp-android")
}
