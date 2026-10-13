# Mobile sign-in, invite redeem, and the live Bulletin (slice 011)

Implements ADR-0007 "Mobile" with the magic link only (Apple/Google native sign-in is deferred),
D12 invite codes on device, D28 secure token storage, and the first screen that reads the real
API from a phone: Bulletin with the ack outbox (D16).

## Flow on the device

1. `SignInScreen` / `SignInView`: email → `POST /v1/auth/magic-link` (always 202).
2. The user pastes the emailed link (or the bare token). `extractMagicToken` accepts
   `…/auth/verify#token=…` or a 32–128 char token and nothing else.
3. `POST /v1/auth/magic-link/verify` with `client: native` returns the session token once.
   `SessionManager` stores it in the platform `SecureStore` and, when the account already
   belongs to trips, adopts the one that matters today from `GET /v1/me/participations` (slice
   067, D42: on today, else the next to start, else the one that ended last; the route carries
   each trip's days and zone since this slice).
4. No participation → `InviteScreen` / `InviteView`: `POST /v1/invites/redeem`; the role comes
   with the code. The active trip is stored (org, trip, participation, role).
5. Bulletin tab: `syncBulletin` replays the ack outbox, lists announcements with the bearer
   token, merges, and shows "Live" or "Syncing"; offline keeps the local feed and the outbox.
6. Sign out: `POST /v1/auth/logout`, then every key in the secure store is cleared.

"Browse the sample trip" enters sample mode: the fixture app with its chips, no account.

## Pieces

| Layer | File | Notes |
|---|---|---|
| API | `routes/auth.ts` `GET /v1/me/participations` | Walks the caller's memberships and asks each OrgDO for participations with trip names. |
| Core | `api/Auth.kt`, `ApiClient` | DTOs and calls: requestMagicLink, verifyMagicLink, me, myParticipations, redeemInvite, logout. |
| Core | `api/Itinerary.kt`, `today/TodayBuilder.kt` (slice 017) | Published itinerary → Today snapshot; see `itinerary.md`. |
| Core | `api/Incidents.kt`, `incidents/IncidentsModel.kt` (slice 016) | Incident cards, local-first confirmation, merge; see `incidents.md`. |
| Core | `api/Headcounts.kt` (slices 012–013) | Head count DTOs, roster seed, idempotent push, incident id; see `headcounts.md`, `incidents.md`. |
| Core | `session/SecureStore.kt` | Interface + in-memory impl for tests. |
| Core | `session/SessionManager.kt` | `SessionState` (SignedOut, AwaitingLink, NeedsInvite, Ready), `ActiveTrip`, `extractMagicToken`. |
| Core | `sync/BulletinSync.kt` | One refresh: replay outbox, list, merge. |
| Android | `session/KeystoreSecureStore.kt` | AES-256-GCM key in AndroidKeyStore, ciphertext in SharedPreferences, unreadable values treated as signed out. |
| Android | `session/AppGraph.kt`, `SessionViewModel.kt`, `auth/*Screen.kt`, `AppNavigation.kt` | Root route from `SessionState`; sample mode. |
| iOS | `Session/KeychainSecureStore.swift`, `Session/SessionModel.swift`, `Auth/SignInView.swift` | Keychain, device-only accessibility; SKIE async calls. |

## Switching trips (slice 067, D42)

`session/TripChoice.kt`: `TripChoice` (the `ActiveTrip`, the trip's days and zone, who the
person is on it), `tripChoiceOf`, `defaultChoice(choices, today)` (the rule above),
`dateLine` ("2026-12-26 → 2027-01-07"), `roleLine` ("Leader · Bus A" / "인솔자 · Bus A"),
`switchSpoken`. `SessionManager.tripChoices()` lists them and `switchTo(choice)` writes the
chosen trip to the store, so `current()` is `Ready` with it at once; `today` is a property the
tests pin (`todayIsoDate()` per platform otherwise). Android: the Today header carries "Switch
trip" when signed in on a trip; it opens a `ModalBottomSheet` with `TripChoiceList` (the
current trip marked, the rows "Switch to …" to a screen reader); `SessionViewModel` loads the
choices and `switchTrip` updates the session state, and because every view model is keyed by
the trip id (`viewModel(key = "today-<tripId>")`), the whole app rebinds. iOS: the same button
and sheet (`TripSwitchSheet`, `TripChoiceList`); `SessionModel.switchTrip` updates the session
and `RootView` keys `TodayView` by the trip id. Sample mode has no switch. Evidence:
`android/today-trip-switch.png`, `ios/today-trip-switch.png`.

## Tests

- Core: `SessionManagerTest` (token extraction, full request → verify → redeem → sign-out with
  bearer header, failure paths), `BulletinSyncTest` (replay then list; unreachable keeps outbox).
- Android: `SessionViewModelTest` (state mirroring, safe messages), `AuthScreenshotTest`
  (sign-in, awaiting link with error, invite).
- iOS: built and unit-tested in the `ios` CI job.

## Not yet

Android App Links / iOS Universal Links for `https://…/auth/verify` (the pasted link is the
current path), Apple and Google native sign-in, refresh-token rotation for native sessions,
device revocation wipe directive (D28, API side), KO strings.

## App Links and Universal Links (slice 019)

The magic link in the sign-in email points at the console origin: `https://<console>/auth/verify#token=…`
(`app.voysemble.com` in production, `<build>.dev.voysemble.cfd` in previews). With the app
installed, the phone opens that link in the app, which verifies the token itself; without the
app, the browser flow is unchanged, and the paste flow stays as the fallback.

| Piece | Where | Notes |
|---|---|---|
| Association files | `apps/api-worker/src/routes/wellknown.ts` | `/.well-known/assetlinks.json` from `ANDROID_CERT_SHA256` (comma-separated SHA-256 fingerprints of the signing certificates) and `/.well-known/apple-app-site-association` from `APPLE_APP_IDS` (`TEAMID.com.voysemble.app`, comma-separated). Unset vars publish an honest empty association. `run_worker_first` includes `/.well-known/*`. Cached for an hour. |
| Android | `AndroidManifest.xml`, `build.gradle.kts` | An `autoVerify` intent filter on `https://${appLinkHost}/auth/verify`; `appLinkHost` is a manifest placeholder per build type (`staging.dev.voysemble.cfd` for debug, `app.voysemble.com` for release), mirrored in `BuildConfig.LINK_HOST`. The activity is `singleTop` so a link while running arrives in `onNewIntent`. |
| Android hand-off | `session/AppLinks.kt`, `MainActivity.kt`, `AppRoot` | `magicLinkFrom(intent)` accepts only an https link on `/auth/verify` carrying a token; `PendingLink` hands it from the activity to the root composable, which calls `SessionViewModel.verify` once unless already signed in. |
| iOS | `project.yml` entitlements, `VoysembleApp.swift`, `SessionModel.openMagicLink` | `applinks:app.voysemble.com` and `applinks:staging.dev.voysemble.cfd`; `onOpenURL` and `onContinueUserActivity(NSUserActivityTypeBrowsingWeb)` route the URL to the session, which verifies only `/auth/verify` links with a token. |

Deploy prerequisites, per environment: set `ANDROID_CERT_SHA256` (release keystore and, for
staging, the debug keystore) and `APPLE_APP_IDS` as Worker vars; on iOS the device build needs
a provisioning profile with Associated Domains (the simulator in CI builds with signing off, so
the entitlement is embedded but not validated there). Debug builds talk to staging
(`api.staging.dev.voysemble.cfd`) and claim its console host since slice 089, so one staging
serves the console and the test phones; each preview build has its own host and uses the paste
flow.

Facts established by tests: the builders accept only valid fingerprints and app ids and answer
empties otherwise; both routes answer JSON with a cache header and are empty locally; the
Android link filter accepts only the verify path over https with a token and `PendingLink`
offers then consumes.
