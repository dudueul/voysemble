# ADR-0003: Mobile runtime — Kotlin Multiplatform core + SwiftUI + Jetpack Compose

Status: accepted (2026-10-10). Supersedes doc 01 §4 "React Native + Expo".

## Context

Docs 01/02 prescribe React Native + Expo and require a documented reason to deviate.
Founder priorities: minimal attack surface in the app, OS-level background reliability
(location, headcount, uploads), native look matching the reference screens, scale without
rework.

## Decision

- Shared `core` Kotlin Multiplatform module compiled for Android (JVM) and iOS (native framework):
  - API client generated from the Worker's OpenAPI spec (kotlinx.serialization, Ktor)
  - Auth/session handling, Keychain/Keystore adapters behind an interface
  - Offline SQLite schema and sync engine (SQLDelight): cursor, outbox, idempotency keys,
    per-domain conflict rules, visibility-epoch resets
  - Crypto (field decrypt; owner-held-key mode later)
  - Domain rules mirror: permissions, time zones, headcount/announcement state machines
- UI native twice: SwiftUI (iOS), Jetpack Compose (Android).
- OS glue native: location, background tasks, push, camera, maps, widgets, Live Activities.
- SKIE for Swift-friendly Kotlin API surface.
- No JS runtime, no npm packages, no OTA code updates in the app.

## Why not the alternatives

- React Native + Expo: fastest to many screens, but ships a JS runtime and hundreds of npm
  packages; background capabilities need custom native modules anyway.
- Native ×2 without sharing: sync/crypto engine written twice drifts and doubles bugs.
- Compose Multiplatform UI on iOS: not native enough for the reference screens.

## Consequences

- Three languages: TypeScript (Workers, web), Kotlin, Swift. Contracts flow one way:
  Zod -> OpenAPI 3.1 -> generated Kotlin/Swift/TS clients. Server stays authoritative.
- macOS/Xcode runner required for iOS builds and tests. Android runner for Android.
- Journey Graph editor remains PC-web only. Mobile gets impact cards.
- Web console stays React + Vite + TanStack Router/Query (React Flow requires React).
