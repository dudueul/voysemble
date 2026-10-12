# iOS Liquid Glass (slice 037, D32)

The founder asked for Liquid Glass on iOS where it looks better. Apple's guidance is that glass
belongs to the layer that floats over content (navigation, controls), not to the content itself,
so the app keeps its cards opaque and gives the glass to chips, pills, overlay buttons and the tab
bar. Everything is in one file, `mobile/ios-app/Voysemble/Design/Glass.swift`, so the iOS 26
look and the fallback never drift apart.

## What takes glass

| Element | iOS 26 | iOS 17–18 (and Xcode 16 builds) |
|---|---|---|
| Status chips (`Live`, `Syncing`, `Sample data`) on Today, Plan, Meeting window; event status chips; the unread badge on Chats | `.glassEffect(.regular.tint(color), in: Capsule())` via `voyChip(tint:)` | the tinted translucent capsule as before |
| Plan day picker | one `GlassEffectContainer` (`VoyGlassGroup`); each pill `.glassEffect(.regular.interactive())`, the chosen day tinted with the action color (`voyPill`) | filled capsule with the border token |
| Buttons over the green up-next card (`Meeting point` / `Directions`, `Propose a change`, `OK`) | `.buttonStyle(.glass)` inside a glass group (`voyOverlayButton`) | `OverlayCapsuleButtonStyle`: the white 16 % capsule the card had |
| Standard buttons (`Propose an event`, chat `Send`) | `.glass` / `.glassProminent` (`voyButton(prominent:)`) | `.bordered` / `.borderedProminent` |
| Tab bar | the system's glass bar, shrinking on scroll (`tabBarMinimizeBehavior(.onScrollDown)`) | unchanged |
| Sheets (`ProposeChangeSheet`) | the system draws them in glass; nothing to do | unchanged |

Not glass: `Card`, the up-next card itself, the head count rows, list cells, forms. These carry the
reading content and keep the surface and border tokens.

## How the fallback is guarded

The iOS 26 APIs exist only in the iOS 26 SDK (Xcode 26, Swift 6.2), and the app still targets iOS
17. Every helper is written as:

```swift
#if compiler(>=6.2)
if #available(iOS 26.0, *) { /* glass */ } else { /* flat */ }
#else
/* flat */
#endif
```

`#if compiler` keeps Xcode 16 building the app without ever seeing the new symbols;
`#available` keeps an iOS 26 build running on older phones. Adding a new glass element means
adding one helper here, not a conditional in a view.

## CI and captures

The `ios` job runs on `macos-26` (default Xcode 26, iOS 26 simulator), so `CaptureTests` writes
`docs/captures/ios/*.png` with the glass look from this slice on. Until this slice the job ran on
`macos-15` with Xcode 16.4, which built the flat fallback. The job logs `xcodebuild -version` first;
if the image's default moves, that line says what built the captures.

## Facts established by tests

No new behaviour: the existing iOS tests (`LiveModelsTests`, `CoreModelsTests`, `CaptureTests`)
cover the views that gained the helpers, and the captures are the evidence of the look.
