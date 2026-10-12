# Chat channels (slice 033, D22)

Fixed channels only: the whole trip, one per group, one per traveler with their group's leaders,
one per guardian with the organizer. No traveler-to-traveler messages and no guardian-to-leader
messages: minors and liability (D22). Channel ids are derived from the roster, so nothing is
created and nothing can be opened that the matrix does not allow. Exercised by
`apps/api-worker/test/chat.test.ts` (the pure helpers and the routes), `mobile/core/.../chat/ChatModelTest.kt`,
`mobile/android-app/.../chat/ChatsViewModelTest.kt`, `mobile/ios-app/VoysembleTests/LiveModelsTests.swift`,
the Communication cases in `sections.test.tsx` and `apps/organizer-web/e2e/chat.spec.ts`.

## Channels and who is in them (`channelMembersOf` in `@voysemble/contracts`)

| Channel id | Members | Organizer (no participation) |
|---|---|---|
| `trip` | every traveler and leader | yes |
| `group:<name>` | the group's travelers, its leaders, and whole-trip leaders (no group) | no (reading on incident, audited, is a later slice) |
| `traveler:<participationId>` | the traveler and the leaders of their group (or whole-trip leaders) | no (same) |
| `guardian:<participationId>` | the guardian | yes |

What each caller lists (`GET .../chats`): organizer: `trip` and one `guardian:` channel per guardian;
leader: `trip`, their group(s), one `traveler:` channel per traveler of their group(s); traveler:
`trip`, their group, "Your leaders"; guardian: "The organizer". Titles and subtitles are composed
on the server so both phones and the console show the same words.

## Storage (OrgDurableObject, schema version 14)

| Table | Columns | Notes |
|---|---|---|
| `chat_messages` | id, trip_id, channel, sender_key, sender_name, sender_role, body, sent_at | `sender_key` is the participation id, or `acct:<accountId>` for an organizer. Latest 200 per read. Tier 1 content, shredded with the trip (D20). |
| `chat_reads` | trip_id, channel, reader_key, last_read_at | One row per reader and channel; unread = messages by others after it. Opening a channel and sending both move it. |

## Routes (`routes/chat.ts`)

| Route | Behaviour |
|---|---|
| `GET .../chats` | `ChatChannelList`: the caller's channels with `unread` and `lastMessage`. 403 for an account with neither a participation nor an organizer role. |
| `GET .../chats/{channelId}/messages` | `ChatMessageList`: the channel's card (unread 0) and the latest 200 messages oldest first; marks the channel read. 403 outside the matrix, 404 for an unknown channel. |
| `POST .../chats/{channelId}/messages` | `{ body }` (1..1000, trimmed). 201 with the stored message (`mine: true`). |

No sockets yet: the phones poll every 15 seconds while the tab is on screen, the console every
15 seconds while the page is open. Messages carry the sender's name and role, never an account id.

## Console (Communication page)

The Channels card is live with a trip: the organizer's channels with unread badges; a click opens
the thread (bubbles, the organizer's on the right) with a composer; "All channels" goes back.
Without a trip the fixture shows with its "Sample data" chip. Evidence: `web/<project>/communication-chat.png`.

## Phones

The Chats tab (the last tab that was "not built") lists the channels with "N new" badges and the
latest preview; a tap opens the thread; the composer sends local-first: the message shows at once
as "Sending…", becomes the server's copy, or reads "Not sent · tap to retry" (the text is kept).
Opening a channel zeroes its badge and marks it read on the server. Nothing is cached beyond the
session (stricter than the 7 days D28 allows). Sample mode shows Minji's channels and her thread
with her leaders. Evidence: `android/chats-list.png`, `android/chats-thread-dark.png`,
`ios/chats-list.png`, `ios/chats-thread-dark.png`.

## Facts established by tests

- Helpers: ids round-trip; membership follows the matrix (guardians never in `trip` or group
  channels; a whole-trip leader in every group and traveler channel; organizers only in `trip`
  and guardian channels); unknown keys do not exist.
- Worker: each role lists its own channels with the right titles; Minji's trip message reaches
  Kim and the owner, Sora is 403; Minji's leader channel is closed to Choi, Juho and the owner;
  Sora writes to the owner, the owner's list shows unread 1 and the preview, opening zeroes it,
  the owner's reply (sender "Owner", role owner) shows unread 1 for Sora, Kim is 403; Hana's Bus B
  message reaches Choi, not Kim or the owner; unknown channel 404, blank body 400.
- Core: wire shapes map with local times; pending, confirm, fail with retry text, remove; a remote
  merge keeps local pending and failed messages at the end; the fixture thread is Minji's.
- Android: sample mode lists the fixture, opens Minji's thread, shows a send as pending; live
  lists on start, opening fetches and zeroes the badge, a send posts `{"body":…}` and becomes the
  server's copy, an unreachable send stays failed and retry sends it once; 403 is explained.
- iOS: sample mode lists, opens, sends pending; live and unreachable says offline.
- Console unit: the live channel list shows the unread badge; a guardian thread opens, shows the
  message, sends a reply, goes back. Browser: Sora writes from "the phone", a traveler is 403 on
  her channel, the organizer sees the badge, opens, replies (capture), Sora's channel shows the
  reply unread and opening clears it.

## Not done

Sockets and push for new messages (D29); the organizer's audited read of group and traveler
channels on an incident; leader moderation (delete a message in their group); Korean strings;
the per-trip live object (D06) stays a design until sockets are needed.
