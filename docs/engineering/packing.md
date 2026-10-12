# Packing checklist (D38, slices 048 and 056)

The organizer writes the list once on the console; every traveler ticks it on their phone before
the trip; leaders and the organizer read how far along everyone is. A tick is a tier 1 fact
(ADR-0001): an item name and a time. Nobody sees which items a traveler skipped except the
traveler (and their guardian); the organizer's view is counts.

## Who does what

| Role | On the console (Preparation page) | On the phone (Today tab → Packing) |
|---|---|---|
| Owner, organizer | Adds, renames, removes items; reads each item's count and every traveler's progress. | No list of their own (403 on `/mine` without a participation). |
| Leader | Reads the progress (`GET .../packing`); cannot add. | Ticks their own list; not counted among the travelers. |
| Traveler | — | Ticks their own list. |
| Guardian | — | Ticks the list of the traveler they are bound to ("Packing for Minji Park"). |

## Storage (OrgDurableObject schema 18)

`packing_items(id, trip_id, name, note, created_at)` and `packing_ticks(item_id, participation_id,
trip_id, packed_at, by_role)` with one tick per item and participation. Removing an item removes
its ticks; removing a roster row removes that person's ticks (with the rest of their facts).
`by_role` records who ticked (traveler or guardian) for a later audit line; it is not surfaced yet.

## Routes (`routes/packing.ts`)

| Route | Who | Behaviour |
|---|---|---|
| `GET .../packing` | owner, organizer, leader | `PackingList { items (with counts over the travelers), travelers (progress each, over the current items), ready }`. |
| `POST .../packing` | owner, organizer | `CreatePackingItemRequest { name, note }` → 201 `PackingItem`. A blank name is 400. |
| `PATCH .../packing/{itemId}` | owner, organizer | Rename or change the note. |
| `DELETE .../packing/{itemId}` | owner, organizer | Gone with its ticks; again is 404. |
| `GET .../packing/mine` | any participant of the trip | `MyPackingList { travelerParticipationId, travelerName, packingFor: self|guardian, items, packed, total }`. A member without a participation (the organizer) is 403; an unbound guardian is 403. |
| `PUT .../packing/{itemId}/mine` | any participant | `{ packed }` → the item as it is now. Idempotent: ticking twice keeps the first time. |

Travelers, guardians and strangers are 403 on the progress list; anonymous 401; an unknown trip 404.

## Console (Preparation page)

The packing card is live beside the documents card (below the opened requirement's table when
one is open): the ready line ("1 of 3 travelers fully packed"), each item with a meter and
"1 of 3 packed", a note under its name, Remove, the "By traveler" fold with every traveler's
`packed/total`, and the add form ("Add an item": Item, Note). Evidence:
`web/<project>/preparation-packing.png`.

## Phones

Core `packing/PackingModel.kt` holds the list (`PackingList`, `PackingItem`), the optimistic flip
(`withPacked`), the server's replacement (`replaceItem`), the summary ("6 of 9 packed", "All 9
packed", "No items yet. The organizer adds them.") and whose list it is ("Your packing list",
"Packing for Minji Park"). `ApiClient.myPacking` and `setPacked`. Android `PackingViewModel` and
`PackingScreen` (a checkbox row per item, the progress bar, the hint), reached from the Today
tab's packing card, which shows the summary; iOS `PackingModel`, `PackingView` and the same card
with a `NavigationLink`. A tick flips at once; the server's item confirms it; a failure puts it
back with "Could not save the tick (…)"; no connection puts it back with the offline line.
Sample mode shows the fixture's nine items. Evidence: `android/packing-light.png`,
`android/packing-guardian-dark.png`, `ios/packing-light.png`, `ios/packing-guardian-dark.png`,
and the guardian's Today capture with the card.

## Facts established by tests

- Reminders (`packing-reminders.test.ts`): no items, nobody; before 09:00 and on another
  morning, nothing; the morning three days before writes one row each for Minji (one item left),
  Hana (never joined; the row waits), Kim (the leader's own two), Sora (for Minji) and Hana's
  guardian (for Hana), none for Juho who packed everything; the bodies name the items; a second
  run writes nothing; the log reads one event with five normal-lane rows; the lane rule, the
  calendar rule and the words in both languages.

- Worker (`packing.test.ts`): the empty list over the roster's three travelers; two items read
  unpacked by a traveler; her tick moves the counts and her progress; her guardian reads her list
  and ticks for her, which makes her ready; a leader packs for himself without moving the
  travelers' counts; unticking; roles (a leader reads, cannot add; travelers, guardians, strangers
  cannot read the progress; the organizer has no list; anonymous 401); rename; a blank name 400;
  delete takes the ticks; unknown item and trip 404.
- Console unit: the live card lists an item with its count and the ready line, the traveler fold,
  adds an item with a note (the POST body), removes one. Browser: two items, Minji ticks the
  passport "from her phone" (the API as a redeemed traveler), the organizer sees "1 of 3 packed"
  and "Minji Park · Bus A · 1/2"; the capture.
- Core (JVM): wire to list, whose, the flip and the replacement, the summary in EN and KO, the
  fixture; the DTO decode and the tick body.
- Android: sample ticks without the network; live loads, confirms a tick from the server's item,
  puts a failed tick back with the notice; unreachable says offline on load and on a tick; the
  screenshots (a tap ticks the adapter). The guardian's Today capture carries the card.
- iOS: sample and unreachable facts; the captures.

## Reminders (slice 056)

On the mornings three days and one day before the trip starts (the trip zone's date, from 09:00),
the cron's `runPackingReminders` (`lib/packing-reminders.ts`) asks each trip's object who still
has packing left (`packingReminderTargets`: every traveler and leader whose own list over the
current items is not complete, with the missing names, and the guardians bound to those
travelers) and writes one normal-lane `packing_reminder` per person through `notifyRows`:
"Packing: 3 days to go" / "Packing: the trip starts tomorrow", the body "1 of 2 still to pack: EU
plug adapter" (a guardian's: "Minji Park's list: …"; at most three names), in the organization's
language. Once per person and morning (the reference `packing:<startsOn>:<daysLeft>` is checked
before the write), so the ten-minute cron repeats safely; a trip without items reminds nobody; a
traveler who packed everything hears nothing. The phones' inbox shows it as a Packing row; the
organizer's log as one event with its normal-lane count.

## Not done

Reminders with a target the organizer sets (the mornings are fixed); the leader's per-traveler
view on the phone; who-ticked on the console; per-group items.
