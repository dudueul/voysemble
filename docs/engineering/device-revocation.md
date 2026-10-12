# Lost or stolen device (slice 031, D28)

Volunteers use personal phones and there is no MDM. When a phone is lost, the organizer presses
"Revoke devices" on the person's card: every native session of that account is revoked with a wipe
directive, the roster row forgets its account, and a fresh invite code is minted. The phone's
next request answers 401 with `X-Voysemble-Wipe: 1` and code `SESSION_WIPED`; the app clears its
local state at once and returns to sign-in with a notice. The person signs in again on a new phone
and redeems the new code; the row, its group and every recorded fact are the same. Exercised by
`apps/api-worker/test/revoke-devices.test.ts`, `mobile/core/.../session/SessionWipeTest.kt`,
`mobile/android-app/.../session/SessionViewModelTest.kt`, `mobile/ios-app/VoysembleTests/LiveModelsTests.swift`,
the People revoke case in `sections.test.tsx` and `apps/organizer-web/e2e/revoke.spec.ts`.

## Server

| Piece | Behaviour |
|---|---|
| D1 `sessions.revoked_reason` (migration 0002) | `wipe` for a revocation by the organizer; null for a logout. |
| `auth/service.ts` `revokeNativeSessions(accountId)` | Revokes every live **native** session of the account. Web sessions stay: the console is the organizer's own, and a leader who also organizes keeps the console. |
| `auth/middleware.ts`, `app.ts` | A presented token that no longer resolves is checked for the wipe directive; when set, every route that needs a session answers 401 `SESSION_WIPED` with `X-Voysemble-Wipe: 1` instead of a plain 401. Public routes (a new magic link) keep working, so the person can sign in again at once. |
| OrgDO schema v13 `participation_events` | Facts about a row that no other table holds; the first kind is `devices_revoked` (by name, at). The person's timeline reads it. Removed with the row. |
| OrgDO `unbindAccount` | Clears `account_id` (409 `notJoined` when nobody joined) and records the event. |
| `POST .../roster/{participationId}/revoke-devices` (owner, organizer) | Unbind, revoke native sessions, revoke open codes, mint one fresh code (30 days). Answers `RevokeDevicesResponse` `{ revokedSessions, invite }`; the code is shown once. 409 for an unjoined row (revoke its code instead), 404 for an unknown row, 403 for a leader. |

Why a fresh code rather than "redeem the old one again": codes are single use and the old one may
be on the lost phone (a screenshot, a message). Group and role live on the participation row, so
re-enrolment restores them without any copy. The account's organization membership stays; what
the phone held is what gets wiped. Reauth before the action (ADR-0009) is not built: the console
has magic-link sessions only; the action is limited to owner and organizer.

## Phones

- `ApiClient.onWipe` fires once per wiped answer, before the result is returned; `ApiResult.Failed.wiped`
  carries the fact to the screen that made the call. The platform wires `onWipe` to
  `SessionManager.wipe()` (Android `AppGraph`, iOS `SessionModel`).
- `SessionManager.wipe()` clears every stored key without a logout call (the session is already
  dead), stores a revoked notice, and calls `onWiped` so the route changes at once, whatever screen
  made the call. `revokedNotice()` stays true until the next link request or sign-out.
- The sign-in screen shows "This phone's access was revoked by the organizer. Sign in again and
  enter the new invite code they give you." Evidence: `android/sign-in-revoked.png`,
  `ios/sign-in-revoked.png`.
- What there is to wipe today is the secure store (session token, account, active trip). Care
  notes are never cached (slice 030); there is no local database or push token yet. When those
  arrive, `wipe()` is the one place to clear them.

## Console

On a joined person's card the third action is "Revoke devices" (two-step confirmation naming the
person). The status line reads "1 phone signed out. New code XXXX-XXXX (valid until …); hand it
over in person." The row reads Invited again and the timeline shows "Devices revoked by Owner".
Evidence: `web/<project>/people-revoke.png`.

## Facts established by tests

- Worker: a leader is 403 and an unjoined row 409; the revoke answers one revoked session and a
  new code different from the old; Minji's next call is 401 with the header and `SESSION_WIPED`
  while the owner's web session and Kim's phone keep working; her row reads `issued` with no
  account; the timeline shows "Devices revoked by Owner"; the old code is 409 and the new code
  re-enrols the same account on the same row with group Bus A; a second revoke wipes the new phone
  and its code cannot be reused.
- Core: a 401 with the header or the code marks the result wiped and fires the hook once; wipe
  clears every key, keeps the notice, notifies; a plain 401 does nothing; a link request clears the notice.
- Android: a wiped answer mid-session moves the route to sign-in with the notice; a new link
  request clears it. iOS: the notice from the store, refresh, a wipe hook signs out.
- Console unit: the joined card offers Revoke devices (not Remove), confirms, posts, shows the
  status with the code, the row turns Invited, the timeline carries the fact.
- Browser: Minji joins from "the phone", the organizer revokes, her `/v1/me` is 401 with the
  directive, the old code is 409, the new code re-enrols her with Bus A, the row reads Joined again.

## Not done

Reauth before the action; push token and local database clearing (nothing to clear yet); a
guardian's own "I lost my phone" path (they ask the organizer); Korean strings.
