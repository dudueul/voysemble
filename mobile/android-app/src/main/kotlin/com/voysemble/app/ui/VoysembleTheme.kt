// Copyright 2026- At Day. All rights reserved.
// Material 3 theme fed from generated design tokens (packages/design-tokens -> Tokens.kt).
// Brand (blue/cyan) and operational action green are separate on purpose (doc 01 §18.2).

package com.voysemble.app.ui

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.voysemble.design.Tokens

/** Semantic colors that Material 3 has no slot for. */
data class VoysembleColors(
    val action: Color,
    val onAction: Color,
    val success: Color,
    val warning: Color,
    val danger: Color,
    val info: Color,
    val stale: Color,
    val pending: Color,
    val textMuted: Color,
    val border: Color,
    val surfaceRaised: Color,
)

val LightColors = VoysembleColors(
    action = Color(Tokens.Color.Light.Action),
    onAction = Color(Tokens.Color.Light.OnAction),
    success = Color(Tokens.Color.Light.Success),
    warning = Color(Tokens.Color.Light.Warning),
    danger = Color(Tokens.Color.Light.Danger),
    info = Color(Tokens.Color.Light.Info),
    stale = Color(Tokens.Color.Light.Stale),
    pending = Color(Tokens.Color.Light.Pending),
    textMuted = Color(Tokens.Color.Light.TextMuted),
    border = Color(Tokens.Color.Light.Border),
    surfaceRaised = Color(Tokens.Color.Light.SurfaceRaised),
)

val DarkColors = VoysembleColors(
    action = Color(Tokens.Color.Dark.Action),
    onAction = Color(Tokens.Color.Dark.OnAction),
    success = Color(Tokens.Color.Dark.Success),
    warning = Color(Tokens.Color.Dark.Warning),
    danger = Color(Tokens.Color.Dark.Danger),
    info = Color(Tokens.Color.Dark.Info),
    stale = Color(Tokens.Color.Dark.Stale),
    pending = Color(Tokens.Color.Dark.Pending),
    textMuted = Color(Tokens.Color.Dark.TextMuted),
    border = Color(Tokens.Color.Dark.Border),
    surfaceRaised = Color(Tokens.Color.Dark.SurfaceRaised),
)

val LocalVoysembleColors = androidx.compose.runtime.staticCompositionLocalOf { LightColors }

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

private val VoysembleTypography = Typography(
    headlineLarge = TextStyle(fontSize = Tokens.Type.Display.size.sp, lineHeight = Tokens.Type.Display.lineHeight.sp, fontWeight = FontWeight.Bold, letterSpacing = (-0.5).sp),
    titleLarge = TextStyle(fontSize = Tokens.Type.Title.size.sp, lineHeight = Tokens.Type.Title.lineHeight.sp, fontWeight = FontWeight.Bold),
    titleMedium = TextStyle(fontSize = Tokens.Type.Heading.size.sp, lineHeight = Tokens.Type.Heading.lineHeight.sp, fontWeight = FontWeight.SemiBold),
    bodyLarge = TextStyle(fontSize = Tokens.Type.Body.size.sp, lineHeight = Tokens.Type.Body.lineHeight.sp),
    bodyMedium = TextStyle(fontSize = Tokens.Type.Caption.size.sp, lineHeight = Tokens.Type.Caption.lineHeight.sp, fontWeight = FontWeight.Medium),
    labelSmall = TextStyle(fontSize = Tokens.Type.Micro.size.sp, lineHeight = Tokens.Type.Micro.lineHeight.sp, fontWeight = FontWeight.SemiBold, letterSpacing = 0.4.sp),
)

private val VoysembleShapes = Shapes(
    small = RoundedCornerShape(Tokens.Radius.Control.dp),
    medium = RoundedCornerShape(Tokens.Radius.Card.dp),
    large = RoundedCornerShape(Tokens.Radius.Sheet.dp),
)

@Composable
fun VoysembleTheme(darkTheme: Boolean = isSystemInDarkTheme(), content: @Composable () -> Unit) {
    androidx.compose.runtime.CompositionLocalProvider(LocalVoysembleColors provides if (darkTheme) DarkColors else LightColors) {
        MaterialTheme(
            colorScheme = if (darkTheme) DarkScheme else LightScheme,
            typography = VoysembleTypography,
            shapes = VoysembleShapes,
            content = content,
        )
    }
}
