// Copyright 2026- At Day. All rights reserved.
// Included build that compiles the convention plugins. Shares the root version catalog.

rootProject.name = "build-logic"

dependencyResolutionManagement {
    repositories {
        mavenCentral()
        gradlePluginPortal()
        if (providers.gradleProperty("voysemble.android").map(String::toBoolean).getOrElse(true)) {
            google()
        }
    }
    versionCatalogs {
        create("libs") { from(files("../gradle/libs.versions.toml")) }
    }
}
