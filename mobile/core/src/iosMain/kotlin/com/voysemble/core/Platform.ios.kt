// Copyright 2026- At Day. All rights reserved.
package com.voysemble.core

import platform.Foundation.NSDate
import platform.Foundation.NSDateFormatter
import platform.UIKit.UIDevice

public actual val platformName: String =
    "ios ${UIDevice.currentDevice.systemVersion}"

public actual fun todayIsoDate(): String =
    NSDateFormatter().apply { dateFormat = "yyyy-MM-dd" }.stringFromDate(NSDate())
