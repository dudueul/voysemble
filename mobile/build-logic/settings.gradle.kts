// Copyright 2026- At Day. All rights reserved.
// Included build that compiles the convention plugins. Shares the root version catalog. When
// voysemble.android=true it also includes build-logic-android so `voysemble.kmp` can apply the
// Android convention plugin from its own classpath (plugins from an included build are not
// resolvable through `apply(plugin = ...)` otherwise).

rootProject.name = "build-logic"

val withAndroid = providers.gradleProperty("voysemble.android").map(String::toBoolean).getOrElse(true)

if (withAndroid) {
    includeBuild("../build-logic-android")
}

dependencyResolutionManagement {
    repositories {
        mavenCentral()
        gradlePluginPortal()
        if (withAndroid) google()
    }
    versionCatalogs {
        create("libs") { from(files("../gradle/libs.versions.toml")) }
    }
}
