// Copyright 2026- At Day. All rights reserved.
package com.voysemble.core

import platform.UIKit.UIDevice

public actual val platformName: String =
    "ios ${UIDevice.currentDevice.systemVersion}"
