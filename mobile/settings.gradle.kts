// Copyright 2026- At Day. All rights reserved.
//
// Mobile workspace: KMP `core` + Compose `android-app`. The SwiftUI app lives in ios-app/ and
// consumes the `core` framework produced by Gradle on macOS.
//
// Plugins come from the included `build-logic` build (precompiled convention plugins) and, when
// voysemble.android=true, from `build-logic-android`. Android requires Google Maven
// (dl.google.com). Hosts without it build with `-Pvoysemble.android=false`, which drops the
// Android included build, target, and app. See mobile/README.md.

pluginManagement {
    includeBuild("build-logic")
    if (providers.gradleProperty("voysemble.android").map(String::toBoolean).getOrElse(true)) {
        includeBuild("build-logic-android")
    }
    repositories {
        gradlePluginPortal()
        mavenCentral()
        if (providers.gradleProperty("voysemble.android").map(String::toBoolean).getOrElse(true)) {
            google()
        }
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        mavenCentral()
        if (providers.gradleProperty("voysemble.android").map(String::toBoolean).getOrElse(true)) {
            google()
        }
    }
}

rootProject.name = "voysemble-mobile"

include(":core")
if (providers.gradleProperty("voysemble.android").map(String::toBoolean).getOrElse(true)) {
    include(":android-app")
}
