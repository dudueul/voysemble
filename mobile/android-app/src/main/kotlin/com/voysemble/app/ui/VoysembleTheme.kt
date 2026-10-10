// Copyright 2026- At Day. All rights reserved.
// Material 3 theme fed from generated design tokens (packages/design-tokens -> Tokens.kt).
// Brand (blue/cyan) and operational action green are separate on purpose (doc 01 §18.2).

package com.voysemble.app.ui

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import com.voysemble.design.Tokens

private val LightScheme = lightColorScheme(
    primary = Color(Tokens.Color.Light.Brand),
    onPrimary = Color(Tokens.Color.Light.TextOnBrand),
    secondary = Color(Tokens.Color.Light.BrandAccent),
    tertiary = Color(Tokens.Color.Light.Action),
    onTertiary = Color(Tokens.Color.Light.OnAction),
    background = Color(Tokens.Color.Light.Bg),
    surface = Color(Tokens.Color.Light.Surface),
    onBackground = Color(Tokens.Color.Light.Text),
    onSurface = Color(Tokens.Color.Light.Text),
    onSurfaceVariant = Color(Tokens.Color.Light.TextMuted),
    outline = Color(Tokens.Color.Light.Border),
    error = Color(Tokens.Color.Light.Danger),
)

private val DarkScheme = darkColorScheme(
    primary = Color(Tokens.Color.Dark.Brand),
    onPrimary = Color(Tokens.Color.Dark.TextOnBrand),
    secondary = Color(Tokens.Color.Dark.BrandAccent),
    tertiary = Color(Tokens.Color.Dark.Action),
    onTertiary = Color(Tokens.Color.Dark.OnAction),
    background = Color(Tokens.Color.Dark.Bg),
    surface = Color(Tokens.Color.Dark.Surface),
    onBackground = Color(Tokens.Color.Dark.Text),
    onSurface = Color(Tokens.Color.Dark.Text),
    onSurfaceVariant = Color(Tokens.Color.Dark.TextMuted),
    outline = Color(Tokens.Color.Dark.Border),
    error = Color(Tokens.Color.Dark.Danger),
)

@Composable
fun VoysembleTheme(darkTheme: Boolean = isSystemInDarkTheme(), content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = if (darkTheme) DarkScheme else LightScheme, content = content)
}
