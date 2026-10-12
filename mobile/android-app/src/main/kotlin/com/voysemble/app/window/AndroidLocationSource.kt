// Copyright 2026- At Day. All rights reserved.
// One-shot device fix for meeting windows (D15, slice 029) through the platform LocationManager:
// no Play Services, no background use, no stored track. Null without permission, without a
// provider, or when no fix arrives within the timeout; the caller then reports "uncertain".

package com.voysemble.app.window

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationManager
import android.os.Build
import android.os.CancellationSignal
import androidx.core.content.ContextCompat
import com.voysemble.core.window.LocationFix
import com.voysemble.core.window.LocationSource
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withTimeoutOrNull
import kotlin.coroutines.resume

class AndroidLocationSource(private val context: Context) : LocationSource {
    @SuppressLint("MissingPermission") // checked below; lint cannot follow the booleans
    override suspend fun fix(): LocationFix? {
        if (!hasLocationPermission(context)) return null
        val fine = granted(context, Manifest.permission.ACCESS_FINE_LOCATION)
        val lm = context.getSystemService(Context.LOCATION_SERVICE) as? LocationManager ?: return null
        val provider = when {
            fine && lm.isProviderEnabled(LocationManager.GPS_PROVIDER) -> LocationManager.GPS_PROVIDER
            lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER) -> LocationManager.NETWORK_PROVIDER
            else -> return null
        }
        val location: Location? = try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                withTimeoutOrNull(FIX_TIMEOUT_MS) {
                    suspendCancellableCoroutine { cont ->
                        val signal = CancellationSignal()
                        cont.invokeOnCancellation { signal.cancel() }
                        lm.getCurrentLocation(provider, signal, ContextCompat.getMainExecutor(context)) { cont.resume(it) }
                    }
                }
            } else {
                lm.getLastKnownLocation(provider)
            }
        } catch (_: SecurityException) {
            null
        }
        val l = location ?: return null
        return LocationFix(l.latitude, l.longitude, if (l.hasAccuracy()) l.accuracy.toDouble() else DEFAULT_ACCURACY_M)
    }

    companion object {
        const val FIX_TIMEOUT_MS = 15_000L
        /** A fix without an accuracy estimate is treated as a coarse one. */
        const val DEFAULT_ACCURACY_M = 100.0
        val PERMISSIONS = arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION)
    }
}

fun hasLocationPermission(context: Context): Boolean =
    granted(context, Manifest.permission.ACCESS_FINE_LOCATION) || granted(context, Manifest.permission.ACCESS_COARSE_LOCATION)

private fun granted(context: Context, permission: String): Boolean =
    ContextCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED
