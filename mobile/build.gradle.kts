// Copyright 2026- At Day. All rights reserved.
// Root build. Plugins are provided by the included `build-logic` build; nothing is applied here.

val withAndroid = providers.gradleProperty("voysemble.android").map(String::toBoolean).getOrElse(true)

// Surface the toggle in logs so CI output states which configuration ran.
logger.lifecycle("voysemble.android=$withAndroid")
