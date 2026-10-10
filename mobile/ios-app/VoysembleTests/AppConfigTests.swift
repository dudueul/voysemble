// Copyright 2026- At Day. All rights reserved.
// Fact: a debug build never points at production.

import XCTest
@testable import Voysemble

final class AppConfigTests: XCTestCase {
    func testDebugHostIsNotProduction() {
        #if DEBUG
        XCTAssertNotEqual(AppConfig.apiHost, "api.voysemble.com")
        #endif
    }
}
