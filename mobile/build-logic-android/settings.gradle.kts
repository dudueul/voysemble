// Copyright 2026- At Day. All rights reserved.
// Included only when voysemble.android=true (see ../settings.gradle.kts). Needs Google Maven.

rootProject.name = "build-logic-android"

dependencyResolutionManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
    versionCatalogs {
        create("libs") { from(files("../gradle/libs.versions.toml")) }
    }
}
