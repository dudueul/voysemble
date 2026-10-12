# Photos (slice 043, D18, D34)

Travelers and leaders fill the trip pool from their phones (slice 044) and organizers from the
console; the moderation model only flags; a leader decides, builds the guardian album by tagging
the travelers in a photo (or the whole group), and guardians see exactly that (ADR-0009). Location
never reaches storage, bytes never sit in clear, and an uploader can take their photo back.
Exercised by `apps/api-worker/test/image-strip.test.ts`, `media.test.ts`, `ai.test.ts`, the Media
cases in `sections.test.tsx` and `apps/organizer-web/e2e/media.spec.ts`.

## Storage

| Where | What | Tier |
|---|---|---|
| R2 `MEDIA` (`voysemble-media-local`, `-preview`, `-staging`, `-prod`) | `media/<orgId>/<tripId>/<photoId>/o` (original) and `/t` (thumbnail), each `nonce ‖ AES-256-GCM ciphertext` under `MEDIA_KEY` (`lib/media-crypto.ts`; a fixed development key locally; 503 in a named environment without the secret). | 3 |
| OrgDurableObject `photos` (schema version 15) | id, trip, uploader (key, name, role), day, taken_at, content_type, sizes, `flag`, `reviewed_at/by`, `album_at/by`, `album_group`, `album_tags` (JSON of participation ids), uploaded_at. | 1 |

Status is derived: `flagged` while `flag` is set and unreviewed; `approved` once `album_at` is set;
`pool` otherwise. Deleting a photo deletes the row and both objects. The trip's shred (D20) covers
the rows; the objects follow the key.

## Upload path (`routes/media.ts`, `POST .../media`)

1. Who: any participation of the trip except guardians, or an organizer account.
2. multipart: `original` (at most 12 MiB), `thumbnail` (at most 512 KiB; optional when the
   original is that small, then the original stands in), `takenAt` (RFC 3339; upload time when
   absent). The type comes from the magic bytes (`lib/image-strip.ts` `sniffImageType`: JPEG, PNG,
   WebP), never from the client; a thumbnail of another type is 400.
3. The AI port judges the thumbnail (`moderateImage`, `ai/AiPort.ts`): Workers AI's LLaVA model is
   asked for one word (NUDITY, VIOLENCE, CHILD, NONE) and the answer becomes `nudity`, `violence`,
   `non_member_minor` or nothing; the fixture port reads the ASCII marker `voysemble-flag:<flag>`
   anywhere in the original (tests and the browser suite plant it in a PNG text chunk); the
   disabled port never flags. A flag hides the photo from other travelers until a leader decides;
   it never deletes anything.
4. Both renditions lose their metadata (`stripMetadata`: JPEG APP1 Exif/XMP and APP13 IPTC; PNG
   `eXIf`, `tEXt`, `zTXt`, `iTXt`, `tIME`; WebP `EXIF`, `XMP ` with the VP8X flags cleared and the
   RIFF size rewritten). Pixels are untouched.
5. Both are sealed and put in R2; the row lands in the organization object with the trip day of
   `takenAt` in the trip's zone (`tripDayOf`; 0 outside the dates).

D34: the device makes the thumbnail (longest edge 320 px, same format) because Workers have no
image codec; ADR-0009 said "server-side", this is the deviation. The console does it with
`createImageBitmap` and an `OffscreenCanvas` (`lib/thumbnail.ts`); the phones with their platform
APIs (slice 044).

## Reads and decisions

| Route | Who | Behaviour |
|---|---|---|
| `GET .../media` | any member of the trip; organizers | `PhotoList` newest first, only what the caller may see; `counts` over that set. Staff and travelers: the pool; a flagged photo only for staff and its uploader. Guardians: approved photos tagged with their traveler or the whole group. |
| `GET .../media/{id}/thumbnail`, `/content` | the same | The bytes, unsealed, `Cache-Control: private, max-age=3600`; 404 when the caller may not see the photo (nothing to learn). |
| `POST .../media/{id}/review {decision}` | owner, organizer, leader | `clear`: back into the pool (`reviewedByName`, the flag kept as history); `remove`: deleted and shredded. 409 when not flagged. |
| `PUT .../media/{id}/album {wholeGroup, participationIds}` | owner, organizer, leader | Into the album with its tags (travelers of this trip; 400 otherwise or when empty); 409 while flagged. Replaces earlier tags. Every tagged traveler gets a `photo_tag` fact on their timeline (D17). |
| `DELETE .../media/{id}/album` | owner, organizer, leader | Out of the album. |
| `DELETE .../media/{id}` | the uploader, or an owner or organizer | Row and objects gone. |

Every route is 404 for an unknown trip, 403 for a stranger, 401 anonymous.

## Console (Media page)

Live once the organization has a trip (the fixture with its hue-tinted placeholders otherwise).
"Upload photos" takes several files; each goes up with a browser-made thumbnail and the file's
own time as `takenAt`; the status line counts them. The pool grid shows thumbnails with the
uploader and the trip day; staff get "Add to album" (a panel: whole group and the travelers of
the roster, "Save to album"), "Change tags", "Remove from album" and "Delete". The review queue
lists flagged photos with the flag's reason and "Approve" / "Remove". The guardian album card
counts approved photos, whole-group ones and tagged ones, and lists them with their tag names
and who approved. The page polls every 30 seconds so a phone's upload shows. Evidence:
`web/<project>/media-live.png`.

## Phones (slice 044, Memories tab)

Both apps replace the Memories placeholder with the tab: the pool as a three-column grid
(uploader and trip day under each thumbnail, "In the album" chip with the tags), the review
queue for leaders (flag reason, Approve, Remove), "Add photos" through the system picker (Android
`PickMultipleVisualMedia`, iOS `PhotosPicker`: no permission prompt, up to five at once), "Album:
whole group" on a pool photo for leaders (per-person tags stay on the console), "Delete my photo"
on one's own and Delete on any for leaders, and the guardian's album-only view. Thumbnails come
through the client with the bearer token (`ApiClient.photoBytes`) and are decoded on the device
(`AndroidImages.decode`, `UIImage(data:)`); the grid never holds a URL. The upload thumbnail is
made on the device (D34): Android samples and scales with `BitmapFactory` in the original's
format; iOS re-encodes the picked image as JPEG (which also leaves EXIF behind) and draws the
thumbnail with `UIGraphicsImageRenderer`. Rules in core `memories/MemoriesModel.kt` (`queue`,
`pool`, `album`, `canReviewPhotos`, `canUploadPhotos`, `canDelete`, `caption`, `albumLabel`,
`summary`), wire types in `api/Media.kt`, the calls in `ApiClient` (`listPhotos`, `photoBytes`,
`uploadPhoto` as multipart, `reviewPhoto`, `albumPhoto`, `deletePhoto`), `Data` ↔ `ByteArray` in
`iosMain/.../DataBridge.kt`. Strings `MEM_*` in both languages. Sample mode shows the fixture
pool as the leader (one flagged, two in the album) with tinted placeholders. Evidence:
`android/memories-light.png`, `android/memories-guardian-dark.png`, `ios/memories-light.png`,
`ios/memories-guardian-dark.png`.

## Facts established by tests

- Stripping: type from magic bytes; JPEG keeps JFIF, tables and the scan byte for byte and loses
  Exif and IPTC (idempotent); PNG keeps IHDR, IDAT, IEND and loses eXIf and text; WebP loses EXIF
  and XMP, clears the VP8X flags and fixes the RIFF size.
- Sealing round trip and tamper refusal (`media-crypto` through the upload and content routes:
  the object at rest does not start with the PNG signature).
- Worker: Minji's upload on the concert day is day 4, type from bytes, metadata chunk gone, the
  bytes come back to Kim and not to Sora; the pool is the same for leader, traveler and organizer
  and empty for guardians; a marked upload is flagged, hidden from Juho, visible to Kim and to
  Minji; album while flagged is 409, a traveler cannot review, Kim clears, clearing twice is 409;
  album tags need at least one traveler of the trip, Juho cannot tag; Sora sees the photo tagged
  with Minji and the group shot, Hana Mom only the group shot, with the bytes to match; the tag
  is on Minji's timeline; out of the album Sora loses it; Juho cannot delete Minji's photo, Minji
  deletes her own and the objects are gone, the owner removes the other; guardians, strangers,
  non-images, a mismatched thumbnail, an oversize original without a thumbnail and a 13 MiB file
  are refused; an organizer's upload carries `owner` and day 0 outside the dates.
- AI port: the one-word answer maps to a flag; junk and errors map to none; the fixture marker.
- Console unit: the live page lists pool, queue and album, approves with `{decision: 'clear'}`,
  tags with the participation ids, deletes; an upload posts multipart with the file and its time.
- Browser: two uploads (one flagged), approve, tag Minji, delete; the thumbnail is 320 px wide.
- Core (`MediaTest`, `MemoriesModelTest`): the list decodes with and without an album; an upload
  is multipart with both renditions and the time under their field names, with the bearer token;
  bytes, review, album and delete hit their routes; a wire photo becomes a memory (the flag only
  while flagged), the three sections, the role rules, captions and labels in both languages, the
  summary per role, upsert and without.
- Android (`MemoriesViewModelTest`): sample mode for a leader and a guardian; live lists, fetches
  the thumbnails with the token, uploads as multipart and lands the photo first, clears a flag out
  of the queue, deletes; unreachable marks offline and an upload says so.
- iOS (`LiveModelsTests.testMemoriesSampleAndUnreachable`): the same for the Swift model.

## Not done

A full-screen viewer and per-person tags on the phones; downloads
and the wrap-up export (D20); the per-organization DEK keyring (ADR-0005) in place of `MEDIA_KEY`;
a size budget per trip; video.
