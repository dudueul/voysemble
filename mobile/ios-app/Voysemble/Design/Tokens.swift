// Copyright 2026- At Day. All rights reserved.
// Generated from tokens.json. Do not edit by hand.
import Foundation

public enum Tokens {
    public enum Color {
        public enum Brand {
            public static let voyBlue: UInt32 = 0xFF2563EB
            public static let sky: UInt32 = 0xFF06B6D4
            public static let sun: UInt32 = 0xFFF59E0B
            public static let coral: UInt32 = 0xFFF97316
            public static let night: UInt32 = 0xFF0F172A
            public static let fog: UInt32 = 0xFF94A3B8
        }
        public enum Operational {
            public static let primary: UInt32 = 0xFF166534
            public static let primaryHover: UInt32 = 0xFF14532D
            public static let onPrimary: UInt32 = 0xFFFFFFFF
            public static let surfaceTint: UInt32 = 0xFFF0FDF4
        }
        public enum Status {
            public static let success: UInt32 = 0xFF16A34A
            public static let warning: UInt32 = 0xFFD97706
            public static let danger: UInt32 = 0xFFDC2626
            public static let info: UInt32 = 0xFF0891B2
            public static let stale: UInt32 = 0xFF64748B
            public static let pending: UInt32 = 0xFF7C3AED
        }
        public enum Neutral {
            public static let n0: UInt32 = 0xFFFFFFFF
            public static let n50: UInt32 = 0xFFF8FAFC
            public static let n100: UInt32 = 0xFFF1F5F9
            public static let n200: UInt32 = 0xFFE2E8F0
            public static let n300: UInt32 = 0xFFCBD5E1
            public static let n400: UInt32 = 0xFF94A3B8
            public static let n500: UInt32 = 0xFF64748B
            public static let n600: UInt32 = 0xFF475569
            public static let n700: UInt32 = 0xFF334155
            public static let n800: UInt32 = 0xFF1E293B
            public static let n900: UInt32 = 0xFF0F172A
            public static let n950: UInt32 = 0xFF020617
        }
        public enum Light {
            public static let bg: UInt32 = 0xFFF8FAFC
            public static let surface: UInt32 = 0xFFFFFFFF
            public static let surfaceRaised: UInt32 = 0xFFFFFFFF
            public static let border: UInt32 = 0xFFE2E8F0
            public static let text: UInt32 = 0xFF0F172A
            public static let textMuted: UInt32 = 0xFF475569
            public static let textOnBrand: UInt32 = 0xFFFFFFFF
            public static let brand: UInt32 = 0xFF2563EB
            public static let brandAccent: UInt32 = 0xFF06B6D4
            public static let action: UInt32 = 0xFF166534
            public static let actionHover: UInt32 = 0xFF14532D
            public static let onAction: UInt32 = 0xFFFFFFFF
            public static let success: UInt32 = 0xFF16A34A
            public static let warning: UInt32 = 0xFFD97706
            public static let danger: UInt32 = 0xFFDC2626
            public static let info: UInt32 = 0xFF0891B2
            public static let stale: UInt32 = 0xFF64748B
            public static let pending: UInt32 = 0xFF7C3AED
        }
        public enum Dark {
            public static let bg: UInt32 = 0xFF020617
            public static let surface: UInt32 = 0xFF0F172A
            public static let surfaceRaised: UInt32 = 0xFF1E293B
            public static let border: UInt32 = 0xFF334155
            public static let text: UInt32 = 0xFFF8FAFC
            public static let textMuted: UInt32 = 0xFF94A3B8
            public static let textOnBrand: UInt32 = 0xFFFFFFFF
            public static let brand: UInt32 = 0xFF60A5FA
            public static let brandAccent: UInt32 = 0xFF06B6D4
            public static let action: UInt32 = 0xFF22C55E
            public static let actionHover: UInt32 = 0xFF16A34A
            public static let onAction: UInt32 = 0xFF020617
            public static let success: UInt32 = 0xFF4ADE80
            public static let warning: UInt32 = 0xFFFBBF24
            public static let danger: UInt32 = 0xFFF87171
            public static let info: UInt32 = 0xFF22D3EE
            public static let stale: UInt32 = 0xFF94A3B8
            public static let pending: UInt32 = 0xFFA78BFA
        }
    }
    public enum Space {
        public static let s1: CGFloat = 4
        public static let s2: CGFloat = 8
        public static let s3: CGFloat = 12
        public static let s4: CGFloat = 16
        public static let s5: CGFloat = 20
        public static let s6: CGFloat = 24
        public static let s8: CGFloat = 32
        public static let s10: CGFloat = 40
        public static let s12: CGFloat = 48
    }
    public enum Radius {
        public static let control: CGFloat = 12
        public static let card: CGFloat = 16
        public static let sheet: CGFloat = 24
        public static let pill: CGFloat = 999
    }
    public enum Type {
        public enum display { public static let size: CGFloat = 32; public static let lineHeight: CGFloat = 38; public static let weight: Int = 700 }
        public enum title { public static let size: CGFloat = 22; public static let lineHeight: CGFloat = 28; public static let weight: Int = 700 }
        public enum heading { public static let size: CGFloat = 17; public static let lineHeight: CGFloat = 22; public static let weight: Int = 600 }
        public enum body { public static let size: CGFloat = 15; public static let lineHeight: CGFloat = 20; public static let weight: Int = 400 }
        public enum caption { public static let size: CGFloat = 13; public static let lineHeight: CGFloat = 18; public static let weight: Int = 500 }
        public enum micro { public static let size: CGFloat = 11; public static let lineHeight: CGFloat = 14; public static let weight: Int = 600 }
    }
    public static let touchTargetMin: CGFloat = 44
}
