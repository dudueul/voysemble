// Copyright 2026- At Day. All rights reserved.
//
// Android app (Jetpack Compose). Built-in Kotlin (AGP 9): no org.jetbrains.kotlin.android plugin.
// Owns: UI, OS glue (permissions, location, push). Business logic comes from :core.
// Included only when voysemble.android=true (settings.gradle.kts). Unverified on a host with
// Google Maven as of 2026-10-10; first Android build must confirm.

plugins {
    // Versions come from the root buildscript classpath (see mobile/build.gradle.kts).
    id("com.android.application")
    id("org.jetbrains.kotlin.plugin.compose")
}

android {
    namespace = "com.voysemble.app"
    compileSdk = libs.versions.compileSdk.get().toInt()

    defaultConfig {
        applicationId = "com.voysemble.app"
        minSdk = libs.versions.minSdk.get().toInt()
        targetSdk = libs.versions.targetSdk.get().toInt()
        versionCode = 1
        versionName = "0.0.1"
        // Backend host per flavor (ADR-0008). Debug defaults to the `next` preview; release is production only.
        buildConfigField("String", "API_HOST", "\"api.voysemble.com\"")
    }

    buildTypes {
        debug {
            buildConfigField("String", "API_HOST", "\"api.next.dev.voysemble.cfd\"")
        }
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_21
        targetCompatibility = JavaVersion.VERSION_21
    }
}

dependencies {
    implementation(project(":core"))
    implementation(libs.androidx.core)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.tooling.preview)
    debugImplementation(libs.androidx.compose.ui.tooling)
    implementation(libs.ktor.client.okhttp)
    implementation(libs.kotlinx.coroutines.core)

    testImplementation(libs.junit)
    testImplementation(kotlin("test"))
    testImplementation(libs.kotlinx.coroutines.test)
    testImplementation(libs.ktor.client.mock)
}
