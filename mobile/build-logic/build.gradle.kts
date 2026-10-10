// Copyright 2026- At Day. All rights reserved.
//
// Convention plugins that every host can compile (no Android Gradle Plugin). Why an included
// build: Gradle script plugins (`apply(from = ...)`) compile against their own classpath and
// cannot see KGP classes, so shared configuration lives in precompiled plugins.
// Android-dependent plugins live in the sibling `build-logic-android` build. When
// voysemble.android=true this build depends on it, which puts `voysemble.kmp-android` on the
// classpath of `voysemble.kmp` so the latter can apply it conditionally. (A single build with a
// conditional source directory does not work: precompiled-script discovery ignores directories
// added after `kotlin-dsl` is applied. Verified 2026-10-10.)

plugins {
    `kotlin-dsl`
}

val withAndroid = providers.gradleProperty("voysemble.android").map(String::toBoolean).getOrElse(true)
logger.lifecycle("build-logic: voysemble.android=$withAndroid")

dependencies {
    implementation(libs.kotlin.gradlePlugin)
    implementation(libs.kotlin.serializationPlugin)
    implementation(libs.skie.gradlePlugin)
    if (withAndroid) implementation("com.voysemble.build:build-logic-android")
}
