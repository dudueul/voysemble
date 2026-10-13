# Guardian status (slice 025, D13)

What a parent sees: status, never coordinates. One route answers the three questions a guardian
asks, and both phones render it as a card on Today in place of the head count card and the
leader links. Exercised by `apps/api-worker/test/guardian.test.ts`,
`mobile/core/.../today/GuardianModelTest.kt`, the guardian cases in `TodayViewModelTest.kt`
and `TodayScreenshotTest.kt` (Android), and `CaptureTests.testTodayGuardian` (iOS).

## Route

| Route | Who | Behaviour |
|---|---|---|
| `GET /v1/orgs/{orgId}/trips/{tripId}/guardian/status` | the calling account's guardian participation in the trip | 403 for travelers, leaders and organizers (they have their own screens); 404 when the guardian is bound to no traveler. |

`GuardianStatus`:

| Field | Source | Meaning |
|---|---|---|
| `traveler` | the participation the guardian is bound to (D12) | id, display name, group. |
| `count.status` | `OrgDurableObject.guardianStatus`: the traveler's mark on the latest head count whose scope covers them (their group, or a whole-trip count) | `not_counted` before any count or while an open count has not reached them; `present`, `with_other_group`, `excused` from the mark; `missing` from the mark, or when a closed count carries no mark for them (D25: unmarked at close is missing). |
| `count.headcountId`, `groupLabel`, `closed`, `atDevice`, `byName`, `receivedAt` | the same head count row | which count, the leader's device clock at close (or at open while open), who opened it, server receipt time. |
| `incident` | the latest incident naming the traveler (`incident_people`) | id, `open` or `resolved`, its kind (`headcount_missing`, `manual`, `help`; slice 080), opened time, and the organizer's guardian message (EN and KO bodies, sent time, sender) once sent (D17); null before. The incident title is not exposed (it can count other travelers, and a help request's words are the traveler's own). |
| `itineraryRevision` | latest published revision | the plan the guardian can read; 0 before the first publish. |

No coordinates, no meeting-window state (D15), no other travelers' names: the worker test checks
the serialized body for the other roster names and for location words.

## Phone card (core rule, both apps)

`core/.../today/GuardianModel.kt`: `guardianCardOf(status, locale, clock)` → `GuardianCard`
(traveler name, group, headline, detail, tone, message). The order of rules:

1. A guardian message exists → headline "Update from the leaders" / "인솔자의 확인 소식", the
   message in the reader's language, tone good when the incident is resolved, attention while open.
2. An open incident of kind `help` (slice 080) → "Asked for help at HH:mm" / "HH:mm에 도움을
   요청했습니다", "The leaders and the organizer are on it. You will get a confirmed update
   here.", tone attention; the traveler's words never travel (D13).
3. An open incident of kind `manual` (slice 080) → "An incident is open since HH:mm" /
   "HH:mm부터 열린 사건이 있습니다", "The leaders are checking…", tone attention.
4. `missing` → "Missing at the HH:mm count" / "HH:mm 인원 점검에서 미확인", "The leaders are
   checking. You will get a confirmed update here.", tone attention.
5. `present` / `with_other_group` / `excused` → "Counted present" / "With another group" /
   "Excused" (KO: "출석 확인됨" / "다른 조와 함께" / "사유 있음"), detail "Bus A · 06:52 · by Kim",
   tone good.
6. Otherwise → "Not counted yet today" / "아직 인원 점검 전입니다", tone calm.

A resolved help request or hand-opened card without a message falls through to the count. The
fixture's `guardianStatusAskedForHelp()` and `guardianCardAskedForHelp(locale)` stand in for
the captures (`android/today-guardian-help.png`, `ios/today-guardian-help.png`).

Android `TodayViewModel` asks for the status only when `ActiveTrip.role == "guardian"` and
renders `GuardianStatusCard` instead of the head count card; iOS `TodayModel` and
`GuardianStatusCard` do the same. Sample mode has `KoreaConcertTourFixture.guardianStatus()`
(Minji counted present on Bus A at 06:52 by Kim Daeun).

## Facts established by tests

- Worker: travelers, leaders and the organizer get 403; before any count the status is
  `not_counted` with every count field null, no incident, revision 0, and the body names no other
  traveler and no location; an open count with Minji present reads `present` with the id, group,
  `06:50`, "Kim" and a receipt time; closing with Minji missing reads `missing`, closed, `06:55`,
  and the incident open without a message; after Kim confirms and the organizer sends the
  message, the status carries both bodies and the sender.
- Core: the card texts and tones for present (EN and KO where-line), missing (attention) then
  the leaders' message (good when resolved, KO body under the KO locale), not counted, with
  another group, excused.
- Android: a guardian's live Today requests the status and shows "Counted present" with the
  where-line; a leader's never requests it; the screenshot test pins the card and the absence of
  "Open head count". Capture `today-guardian.png`.
- iOS: capture `today-guardian.png` from the fixture card.

- Slice 080: worker: the head count's incident carries `kind: headcount_missing`; once resolved,
  Minji's own request is the latest incident with `kind: help` and no message, and her words
  are not in the body. Core: the help card in both languages with the attention tone, the
  hand-opened card, the fall-through once resolved, the fixture card. Android: the guardian's
  Today with the request open (capture). iOS: the fixture card's headline in both languages and
  its tone (capture).

## Not done

The daily digest as a push (D29; it goes by email since slice 054, push waits for the store
setup); a guardian tab on the console's person card. Done since: the Bulletin tab on a
guardian's phone reads the server's guardian filter (shared announcements only); the approved
photo album (slice 044, `media.md`, `memories-guardian-dark.png`); the fee balance on the card
(D23, `fees.md`); the care note entry (slice 032, `care-notes.md`); the help request and the
hand-opened card on the card (slice 080, above).
