# Mobile sign-in, invite redeem, and the live Bulletin (slice 011)

Implements ADR-0007 "Mobile" with the magic link only (Apple/Google native sign-in is deferred),
D12 invite codes on device, D28 secure token storage, and the first screen that reads the real
API from a phone: Bulletin with the ack outbox (D16).

## Flow on the device

1. `SignInScreen` / `SignInView`: email → `POST /v1/auth/magic-link` (always 202).
2. The user pastes the emailed link (or the bare token). `extractMagicToken` accepts
   `…/auth/verify#token=…` or a 32–128 char token and nothing else.
3. `POST /v1/auth/magic-link/verify` with `client: native` returns the session token once.
   `SessionManager` stores it in the platform `SecureStore` and adopts the first participation
   from `GET /v1/me/participations` when the account already belongs to a trip.
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
| Core | `api/Headcounts.kt` (slices 012–013) | Head count DTOs, roster seed, idempotent push, incident id; see `headcounts.md`, `incidents.md`. |
| Core | `session/SecureStore.kt` | Interface + in-memory impl for tests. |
| Core | `session/SessionManager.kt` | `SessionState` (SignedOut, AwaitingLink, NeedsInvite, Ready), `ActiveTrip`, `extractMagicToken`. |
| Core | `sync/BulletinSync.kt` | One refresh: replay outbox, list, merge. |
| Android | `session/KeystoreSecureStore.kt` | AES-256-GCM key in AndroidKeyStore, ciphertext in SharedPreferences, unreadable values treated as signed out. |
| Android | `session/AppGraph.kt`, `SessionViewModel.kt`, `auth/*Screen.kt`, `AppNavigation.kt` | Root route from `SessionState`; sample mode. |
| iOS | `Session/KeychainSecureStore.swift`, `Session/SessionModel.swift`, `Auth/SignInView.swift` | Keychain, device-only accessibility; SKIE async calls. |

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
