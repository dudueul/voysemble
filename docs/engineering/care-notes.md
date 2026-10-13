# Care notes (slice 030, D27)

A traveler's allergies, medications and one free line: the thing a leader must see in one tap at
lunch, and the thing that must not sit in clear text in ten phones or in a storage dump. Guardians
and the organizer write it; the organizer, the leaders of the traveler's own group, the traveler
and their guardians may reveal it; every reveal is a recorded fact on the person's timeline.
Exercised by `apps/api-worker/test/care-crypto.test.ts`, `apps/api-worker/test/care.test.ts`,
`mobile/core/.../api/CareTest.kt`, `mobile/android-app/.../headcount/HeadcountViewModelTest.kt`,
`mobile/ios-app/VoysembleTests/LiveModelsTests.swift`, the People cases in `sections.test.tsx` and
`apps/organizer-web/e2e/people.spec.ts`.

## Storage (OrgDurableObject, schema version 12)

| Table | Columns | Notes |
|---|---|---|
| `care_notes` | participation_id (PK), trip_id, iv, ciphertext, updated_at, updated_by_name, updated_by_role | One row per traveler with a note. `iv` + `ciphertext` are AES-256-GCM (WebCrypto) over the JSON `{allergies, medications, freeText}`; a fresh 96-bit nonce per write. Tier 2 PII (ADR-0001): the row is noise without the key. |
| `care_reveals` | id, participation_id, trip_id, revealed_by_name, revealed_by_role, revealed_at | One row per reveal, kept after the note is cleared. |

The key is the `CARE_NOTE_KEY` secret (32 bytes, base64; `wrangler secret put CARE_NOTE_KEY` per
named environment). Locally (`ENV_NAME` "local": dev server and tests) a fixed development key
stands in. A named environment without the secret answers 503 on writes and reveals, never a
plaintext fallback. The content is sealed and unsealed inside the Durable Object
(`lib/care-crypto.ts`), so neither the request log nor the storage carries it in clear; it leaves
the object only in the reveal response.

## Routes (`routes/care.ts`)

| Route | Who | Behaviour |
|---|---|---|
| `GET .../people/{participationId}/care-note` | owner, organizer, a leader of the trip, the traveler, a bound guardian | `CareNoteStatus`: `hasCareNote`, who set it and when, the reveal count. Never the content. |
| `PUT .../people/{participationId}/care-note` | owner, organizer, a bound guardian | `CareNote` (`allergies` ≤ 200, `medications` ≤ 200, `freeText` ≤ 500). All blank clears the row. 503 without a key. |
| `POST .../people/{participationId}/care-note/reveal` | owner, organizer, a leader of the traveler's group (a leader without a group covers the trip), the traveler, a bound guardian | Decrypts, records the reveal, answers the note with `updatedAt`, `updatedByName`, `revealedAt`. 404 `No care note on file.` when nothing is stored. |

Every care route is 404 for a row that is not a traveler. Other leaders, other travelers and other
guardians are 403. `RosterEntry.hasCareNote` (the roster and the person card) says whether a note is
on file; the timeline carries `care_update` (the latest write, by role and name) and one
`care_reveal` per reveal. Removing a roster row deletes its note and its reveals.

## Console (People page)

- Roster column "Care note": "Reveal" on rows with a note; one click is one audited reveal and the
  line shows inline until "Hide". Without a trip the fixture rows show a sample line.
- Person card (travelers only): the status line ("Set by Sora Park 5 min ago · 2 reveals so far"
  or "No care note on file."), "Reveal (audited)" / "Hide", and "Edit care note" with the three
  fields, "Save care note", "Clear care note". A save shows what was typed without a reveal (no
  audit for one's own write); the roster and the timeline refetch.
- Evidence: `web/<project>/people-care.png`.

## Phones (head count)

A member with a note shows the care icon in the roster row; a tap reveals (audited) and the line
("Allergies: Peanuts · Medications: EpiPen in the red bag · …", `careLineOf` in core, the same rule
as the console) sits under the name until hidden or the screen goes. The decrypted note lives in
the view model's memory only; nothing is written to disk, which is stricter than the 24-hour cache
D27 allows. 403 reads "Only this group's leaders see the care note.", 404 "No care note on file.",
no network "Offline. Care notes are never cached on the device." Sample mode reveals the fixture
note for Minji Park. Evidence: `android/headcount-care.png`, `ios/headcount-care.png`.

## Phones (guardian entry, slice 032)

Under the guardian's status card on Today sits the care-note card: "Not on file" with "Add care
note", or "On file · N reveals" with "Edit care note". Add starts blank; Edit reveals the current
note (audited, like any reveal) to prefill the three fields. Save sends the three fields; a blank
note clears it; the message names the group whose leaders can reveal it. The phone keeps nothing
after the save. Evidence: `android/today-guardian-care.png`, `ios/today-guardian-care.png`.

## Facts established by tests

- Sealing: round trip; two seals of the same text differ; a flipped byte is refused; the secret is
  used when set; no key outside local without it; a short secret is loud.
- Worker: Sora (bound guardian) writes, Kim (leader), Juho (traveler) and Hana Mom (another
  guardian) cannot; the roster flags Minji and not Juho and carries no content; Kim (Bus A
  leader), Minji, Sora and the owner reveal, Choi (Bus B leader), Juho, Hana and Hana Mom are
  403; the timeline shows the four reveals by role and name and the guardian's update, without the
  content; a blank note from the owner clears the flag, keeps the four reveals and makes the next
  reveal 404; Kim's own row is 404 on every care route.
- Core: the care line joins only the set parts; a roster row without the flag decodes as false and
  the head count member carries it; the reveal response decodes.
- Android: sample reveal shows the fixture line and hide removes it; live reveal posts to the care
  route and shows the line; 403 explains itself.
- iOS: sample reveal shows the fixture line; live and unreachable says offline and caches nothing.
- Guardian entry (slice 032): Android loads the status with the card, Add starts blank, Save PUTs
  the three fields to the traveler's care route and the status follows, Edit reveals to prefill;
  iOS offers Add on a seeded status, cancels, and saving without a traveler id is a no-op.
- Console unit: save sends the three fields, status reads "Set by Owner", content shows without a
  reveal; Hide then Reveal (audited) counts one reveal; the roster button counts another; Clear
  sends blanks and the status returns to "No care note on file.".
- Browser: on Minji's card, save, hide, reveal (1 reveal so far, timeline "Care note revealed by
  owner Owner"), roster reveal shows the line; capture `people-care.png`.

## Not done

Guardian entry during invite redemption (the Today card covers it right after joining); edit
notifications to the organizer; reveal from the person card's timeline entries. Done since:
documents and their sealed scans (slice 045, `documents.md`); Korean strings on the console
(slice 038) and the phones (slice 039).
