// Copyright 2026- At Day. All rights reserved.
//
// Applied by core/build.gradle.kts only when voysemble.android=true. Adds the Android target to
// the KMP module via AGP's `com.android.kotlin.multiplatform.library` plugin (required with
// built-in Kotlin in AGP 9; combining KMP with `com.android.library` is no longer allowed).
// Kept separate so the main build script never references AGP classes on hosts without
// Google Maven. Unverified on such a host as of 2026-10-10; first Android build must confirm.

import com.android.build.api.dsl.KotlinMultiplatformAndroidLibraryExtension
import org.gradle.api.plugins.ExtensionAware
import org.jetbrains.kotlin.gradle.dsl.JvmTarget
import org.jetbrains.kotlin.gradle.dsl.KotlinMultiplatformExtension

apply(plugin = "com.android.kotlin.multiplatform.library")

configure<KotlinMultiplatformExtension> {
    (this as ExtensionAware).extensions.configure<KotlinMultiplatformAndroidLibraryExtension>("android") {
        namespace = "com.voysemble.core"
        compileSdk = libs.versions.compileSdk.get().toInt()
        minSdk = libs.versions.minSdk.get().toInt()
        withHostTestBuilder {}
        compilerOptions.configure {
            jvmTarget.set(JvmTarget.JVM_21)
        }
    }
    sourceSets.getByName("androidMain").dependencies {
        implementation(libs.ktor.client.okhttp)
    }
}
