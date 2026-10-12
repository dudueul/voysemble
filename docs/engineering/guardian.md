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
| `incident` | the latest incident naming the traveler (`incident_people`) | id, `open` or `resolved`, opened time, and the organizer's guardian message (EN and KO bodies, sent time, sender) once sent (D17); null before. The incident title is not exposed (it can count other travelers). |
| `itineraryRevision` | latest published revision | the plan the guardian can read; 0 before the first publish. |

No coordinates, no meeting-window state (D15), no other travelers' names: the worker test checks
the serialized body for the other roster names and for location words.

## Phone card (core rule, both apps)

`core/.../today/GuardianModel.kt`: `guardianCardOf(status, locale, clock)` → `GuardianCard`
(traveler name, group, headline, detail, tone, message). The order of rules:

1. A guardian message exists → headline "Update from the leaders" / "인솔자의 확인 소식", the
   message in the reader's language, tone good when the incident is resolved, attention while open.
2. `missing` → "Missing at the HH:mm count" / "HH:mm 인원 점검에서 미확인", "The leaders are
   checking. You will get a confirmed update here.", tone attention.
3. `present` / `with_other_group` / `excused` → "Counted present" / "With another group" /
   "Excused" (KO: "출석 확인됨" / "다른 조와 함께" / "사유 있음"), detail "Bus A · 06:52 · by Kim",
   tone good.
4. Otherwise → "Not counted yet today" / "아직 인원 점검 전입니다", tone calm.

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

## Not done

Guardian-filtered Bulletin on the phones (the server already filters shared announcements by
participation), the approved photo album (D18), the fee balance (D23), the daily digest push
(D29), a guardian tab on the console's person card.
