// Copyright 2026- At Day. All rights reserved.
//
// Convention: adds the Android target to a KMP module via AGP's
// `com.android.kotlin.multiplatform.library` plugin (required with built-in Kotlin in AGP 9;
// combining KMP with `com.android.library` is no longer allowed). Compiled only when
// voysemble.android=true. Unverified on a host with Google Maven as of 2026-10-10.

import com.android.build.api.dsl.KotlinMultiplatformAndroidLibraryExtension
import org.gradle.api.plugins.ExtensionAware
import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    id("org.jetbrains.kotlin.multiplatform")
    id("com.android.kotlin.multiplatform.library")
}

val catalog = extensions.getByType<VersionCatalogsExtension>().named("libs")
fun version(alias: String): Int = catalog.findVersion(alias).get().requiredVersion.toInt()

kotlin {
    (this as ExtensionAware).extensions.configure<KotlinMultiplatformAndroidLibraryExtension>("android") {
        namespace = "com.voysemble.core"
        compileSdk = version("compileSdk")
        minSdk = version("minSdk")
        withHostTestBuilder {}
        compilerOptions.configure {
            jvmTarget.set(JvmTarget.JVM_21)
        }
    }
    sourceSets.getByName("androidMain").dependencies {
        implementation(catalog.findLibrary("ktor-client-okhttp").get())
    }
}
