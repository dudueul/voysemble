// Copyright 2026- At Day. All rights reserved.
// Liquid Glass for the control layer (D32, slice 037). On iOS 26 the chips, the Plan day picker,
// the buttons that float over a colored card and the tab bar take the system glass; on iOS 17
// and 18, and under a toolchain older than Swift 6.2 (Xcode 16), the same views keep the flat
// tinted look they had. Content cards stay opaque on purpose: glass is for what floats over
// content, not for the content itself (Apple HIG). One file so the fallbacks never drift.

import SwiftUI

extension View {
    /// A tinted capsule chip ("Live", "Sample data", an event status, an unread count).
    @ViewBuilder
    func voyChip(tint: Color) -> some View {
        #if compiler(>=6.2)
        if #available(iOS 26.0, *) {
            self.padding(.horizontal, 10).padding(.vertical, 4)
                .glassEffect(Glass.regular.tint(tint.opacity(0.35)), in: Capsule())
        } else {
            voyFlatChip(tint: tint)
        }
        #else
        voyFlatChip(tint: tint)
        #endif
    }

    private func voyFlatChip(tint: Color) -> some View {
        self.padding(.horizontal, 10).padding(.vertical, 3)
            .background(Capsule().fill(tint.opacity(0.1)))
    }

    /// A selectable pill (the Plan day picker): interactive glass on iOS 26, a filled capsule otherwise.
    @ViewBuilder
    func voyPill(selected: Bool, tint: Color) -> some View {
        #if compiler(>=6.2)
        if #available(iOS 26.0, *) {
            self.padding(.horizontal, 12).padding(.vertical, 6)
                .foregroundStyle(selected ? Color.white : Color.primary)
                .glassEffect(selected ? Glass.regular.tint(tint).interactive() : Glass.regular.interactive(), in: Capsule())
        } else {
            voyFlatPill(selected: selected, tint: tint)
        }
        #else
        voyFlatPill(selected: selected, tint: tint)
        #endif
    }

    private func voyFlatPill(selected: Bool, tint: Color) -> some View {
        self.padding(.horizontal, 12).padding(.vertical, 6)
            .background(Capsule().fill(selected ? tint : Color(argb: Tokens.Color.Light.surface)))
            .overlay(Capsule().stroke(Color(argb: Tokens.Color.Light.border)))
            .foregroundStyle(selected ? Color(argb: Tokens.Color.Light.onAction) : Color.primary)
    }

    /// A button that floats over a colored card (the up-next card): glass on iOS 26, a translucent capsule otherwise.
    @ViewBuilder
    func voyOverlayButton() -> some View {
        #if compiler(>=6.2)
        if #available(iOS 26.0, *) {
            self.buttonStyle(.glass)
        } else {
            self.buttonStyle(OverlayCapsuleButtonStyle())
        }
        #else
        self.buttonStyle(OverlayCapsuleButtonStyle())
        #endif
    }

    /// The app's standard button: glass on iOS 26, bordered otherwise. `prominent` for the one primary action.
    @ViewBuilder
    func voyButton(prominent: Bool = false) -> some View {
        #if compiler(>=6.2)
        if #available(iOS 26.0, *) {
            if prominent { self.buttonStyle(.glassProminent) } else { self.buttonStyle(.glass) }
        } else {
            if prominent { self.buttonStyle(.borderedProminent) } else { self.buttonStyle(.bordered) }
        }
        #else
        if prominent { self.buttonStyle(.borderedProminent) } else { self.buttonStyle(.bordered) }
        #endif
    }

    /// The tab bar shrinks while the reader scrolls down (iOS 26); nothing changes before.
    @ViewBuilder
    func voyTabBarMinimizes() -> some View {
        #if compiler(>=6.2)
        if #available(iOS 26.0, *) {
            self.tabBarMinimizeBehavior(.onScrollDown)
        } else {
            self
        }
        #else
        self
        #endif
    }
}

/// Groups glass siblings (chips in a row) so they share one sampling region; a plain group otherwise.
struct VoyGlassGroup<Content: View>: View {
    @ViewBuilder let content: () -> Content

    var body: some View {
        #if compiler(>=6.2)
        if #available(iOS 26.0, *) {
            GlassEffectContainer(spacing: 8) { content() }
        } else {
            content()
        }
        #else
        content()
        #endif
    }
}

/// The pre-glass look of a button on a colored card: a translucent white capsule that darkens on press.
struct OverlayCapsuleButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .padding(.horizontal, 14).padding(.vertical, 8)
            .background(RoundedRectangle(cornerRadius: 12).fill(.white.opacity(configuration.isPressed ? 0.26 : 0.16)))
    }
}
