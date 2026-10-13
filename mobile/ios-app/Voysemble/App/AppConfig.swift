// Copyright 2026- At Day. All rights reserved.
// Backend host per configuration (ADR-0008). Debug -> staging (slice 089); Release -> production only.

import Foundation

enum AppConfig {
    static var apiHost: String {
        #if DEBUG
        return Bundle.main.object(forInfoDictionaryKey: "VYApiHostDebug") as? String ?? "api.staging.dev.voysemble.cfd"
        #else
        return Bundle.main.object(forInfoDictionaryKey: "VYApiHostRelease") as? String ?? "api.voysemble.com"
        #endif
    }
}
