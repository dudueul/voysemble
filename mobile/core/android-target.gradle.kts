// Copyright 2026- At Day. All rights reserved.
//
// Applied by core/build.gradle.kts only when voysemble.android=true. Adds the Android target to
// the KMP module via AGP's `com.android.kotlin.multiplatform.library` plugin (required with
// built-in Kotlin in AGP 9; combining KMP with `com.android.library` is no longer allowed).
//
// This is a script plugin (`apply(from = ...)`): it sees only the root buildscript classpath
// (where AGP and KGP are declared) and has no generated `libs` accessor, so the version catalog
// is read through VersionCatalogsExtension.

import com.android.build.api.dsl.KotlinMultiplatformAndroidLibraryExtension
import org.gradle.api.artifacts.VersionCatalogsExtension
import org.gradle.api.plugins.ExtensionAware
import org.jetbrains.kotlin.gradle.dsl.JvmTarget
import org.jetbrains.kotlin.gradle.dsl.KotlinMultiplatformExtension

val catalog = extensions.getByType<VersionCatalogsExtension>().named("libs")
fun version(alias: String): Int = catalog.findVersion(alias).get().requiredVersion.toInt()

apply(plugin = "com.android.kotlin.multiplatform.library")

configure<KotlinMultiplatformExtension> {
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
