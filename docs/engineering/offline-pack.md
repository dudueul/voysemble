# The offline pack (slice 087)

A trip abroad loses signal: in a bus tunnel, in a stadium, at a border with roaming off. Before
slice 087 the phones kept the plan only in memory, so an app restarted with no signal opened an
empty Today. ADR-0009 promises that the phone keeps working from the last published revision;
D28 sets where that may live (an encrypted local store with a key in the OS keystore).

## What is kept, where, for how long

| What | Where | Lifetime |
|---|---|---|
| The last itinerary the server answered for the active trip (days, events, revision), with its save time | `OfflinePack` (`mobile/core/.../offline/OfflinePack.kt`) in the platform `SecureStore`: Android SharedPreferences under an AES-256-GCM key in the Android Keystore (`KeystoreSecureStore`); iOS Keychain, this device only, after first unlock (`KeychainSecureStore`) | Until the next answer replaces it, the trip changes, 30 days pass (`MAX_AGE_DAYS`), the person signs out, or a remote wipe (D28) clears the session |

One pack, for the active trip only: a pack saved for another trip is ignored and replaced by the
next save. Nothing else is packed: no roster, no care notes (D28: 24 hours at most, purged on
lock), no documents (never cached), no chat beyond the session.

## How the screens use it

- **Today** (Android `TodayViewModel`, iOS `TodayModel`): on start in live mode, the snapshot is
  built from the pack for the device date and clock in the trip's zone, with "Synced N min ago"
  from the save time; the first refresh replaces it. Every successful itinerary answer is saved.
  An unreachable server leaves the packed snapshot on screen and marks it offline ("Offline.
  Showing the last synced plan.").
- **Plan** (Android `PlanViewModel`, iOS `PlanModel`): the same, opened on the device date's day.
- **Sign-out and wipe**: `SessionManager.clear()` removes `pack.itinerary` with the session keys.

## Facts established by tests

- Core (`OfflinePackTest`): a save loads back for its trip with its save time; another trip's
  pack is ignored, and a later save replaces the earlier one; at 30 days it still loads, one
  millisecond later it is dropped and erased; garbage reads as no pack; clear empties it; the age
  reads in whole minutes, never negative. `SessionWipeTest`: a remote wipe clears the pack.
- Android (`TodayViewModelTest`): an online start saves the pack; a second start two hours later
  with no route to the host opens Today with Breakfast and Depart, "128 min" since the sync,
  marked offline.
- iOS (`LiveModelsTests`): an empty pack opens empty, an unreachable refresh says offline and
  saves nothing; the age in minutes.

## Not done

The bulletin, the packing list and the inbox are not packed (they show what was loaded this
session and queue their writes, as before); a pack per trip for people on several trips; a
"saved for offline" indicator before the first loss of signal.
