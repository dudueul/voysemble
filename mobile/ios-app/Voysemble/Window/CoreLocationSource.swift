// Copyright 2026- At Day. All rights reserved.
// One-shot device fix for meeting windows (D15, slice 029) through CoreLocation: when-in-use
// permission asked on first use, no background mode, nothing stored. Nil when permission is
// missing or no fix arrives; the model then reports "uncertain". The fix is compared with the
// meeting point in core and only the judged state leaves the phone.

import CoreLocation
import VoysembleCore

final class CoreLocationSource: NSObject, DeviceLocationSource, CLLocationManagerDelegate {
    private let manager = CLLocationManager()
    private var fixContinuation: CheckedContinuation<LocationFix?, Never>?
    private var authContinuation: CheckedContinuation<Void, Never>?

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyHundredMeters
    }

    func fix() async -> LocationFix? {
        if manager.authorizationStatus == .notDetermined {
            await withCheckedContinuation { (c: CheckedContinuation<Void, Never>) in
                authContinuation = c
                manager.requestWhenInUseAuthorization()
            }
        }
        guard manager.authorizationStatus == .authorizedWhenInUse || manager.authorizationStatus == .authorizedAlways else { return nil }
        guard fixContinuation == nil else { return nil } // one request at a time
        return await withCheckedContinuation { (c: CheckedContinuation<LocationFix?, Never>) in
            fixContinuation = c
            manager.requestLocation()
        }
    }

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        guard manager.authorizationStatus != .notDetermined else { return }
        authContinuation?.resume()
        authContinuation = nil
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        let c = fixContinuation
        fixContinuation = nil
        if let l = locations.last, l.horizontalAccuracy >= 0 {
            c?.resume(returning: LocationFix(lat: l.coordinate.latitude, lng: l.coordinate.longitude, accuracyMeters: l.horizontalAccuracy))
        } else {
            c?.resume(returning: nil)
        }
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        fixContinuation?.resume(returning: nil)
        fixContinuation = nil
    }
}
