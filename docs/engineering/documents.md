# Documents and forms (slice 045, D27, D35, D36)

What a trip needs from every traveler (a passport copy, a consent form, insurance), who handed it
in, and the scan when the organizer keeps one. Scans are tier 3 (ADR-0001): sealed at rest,
organizer console only, revealed after a step-up confirmation, every reveal a fact on the
traveler's timeline, never on a phone. Exercised by `apps/api-worker/test/documents.test.ts`, the
Preparation cases in `sections.test.tsx`, `auth.test.tsx` (the reauth landing page) and
`apps/organizer-web/e2e/preparation.spec.ts`.

## Storage

| Where | What | Tier |
|---|---|---|
| OrgDurableObject `document_requirements` (schema 16) | id, trip, name, required, due_on, created_at | 1 |
| OrgDurableObject `document_items` | (requirement, participation): state `missing` / `collected` / `waived`, updated_at/by, the scan's type, size, uploaded_at/by | 1 |
| R2 `MEDIA` | `documents/<orgId>/<tripId>/<requirementId>/<participationId>`: `nonce ‖ AES-256-GCM` under `MEDIA_KEY` (`lib/media-crypto.ts`, the same sealing as photos) | 3 |
| D1 `participation_events` | `document_reveal` rows: who, when, `{requirementId, name}` | 1 |

A traveler without a row counts as missing. Removing a roster row deletes its items; the objects
go with the trip's shred (D20) or when the scan or the requirement is deleted.

## Step-up reauthentication (D35)

There is no password to re-enter, so a protected action asks the mailbox again: `POST
/v1/auth/reauth` emails the signed-in account a one-time link (`magic_links.purpose = 'reauth'`,
15 minutes, the same per-address rate limit as a sign-in link); the link lands on the console's
`/auth/reauth`, which posts the token with the same session to `POST /v1/auth/reauth/verify`; the
session gets `reauthed_at = now` (migration 0005) and protected routes accept it for ten minutes
(`requireRecentReauth`, else `403 REAUTH_REQUIRED`). A sign-in link never confirms; a reauth link
never signs in (`verifyMagicLink` refuses the purpose); another account's link is 404.

## Routes (`routes/documents.ts`, owner and organizer)

| Route | Behaviour |
|---|---|
| `GET .../documents` | `DocumentRequirementList`: requirements in creation order with `counts { travelers, collected, waived, missing, scans }`, the traveler count, `missingRequired`. |
| `POST .../documents` | `CreateDocumentRequirementRequest { name, required = true, dueOn? }` → 201. |
| `PATCH .../documents/{id}` | any subset of name, required, dueOn (nullable). |
| `DELETE .../documents/{id}` | rows and scans gone (objects shredded). |
| `GET .../documents/{id}/items` | `DocumentItemList`: every traveler (group, then name) with state, who set it, the scan facts, the reveal count. |
| `PUT .../documents/{id}/items/{participationId}` | `{ state }`. 404 for a non-traveler. |
| `POST .../items/{participationId}/scan` | multipart `file`: PDF (`%PDF-`), JPEG or PNG from the magic bytes, at most 12 MiB; images lose their metadata (`lib/image-strip.ts`); sealed and stored; the row becomes collected. 503 without `MEDIA_KEY`. |
| `POST .../items/{participationId}/scan/reveal` | `requireRecentReauth`; the bytes unsealed with `Cache-Control: no-store`, `Content-Disposition: inline`; a `document_reveal` fact lands on the timeline. A POST, not a GET: Chromium replays an idempotent GET on a stale keep-alive socket, which doubled the audit line in the browser suite. |
| `DELETE .../items/{participationId}/scan` | the object shredded; the state stays. |

Leaders, travelers, guardians and strangers are 403 on all of them; the report
(`TripReport.documents`, slice 034) carries completion over the required requirements.

## Console (Preparation page)

Live once the organization has a trip. The documents card lists the requirements with a meter
(collected + waived over travelers), the due date, "Open" / "Close" and "Remove requirement", and
the add form (document, due date, required). An opened requirement shows the travelers table:
state select (Missing, Collected, Waived), the scan facts with "Upload scan" (hidden file input,
`data-testid="scan-input"`) or "Reveal (audited)" and "Remove scan", and the reveal count. The
reveal fetches the bytes itself; a `403 REAUTH_REQUIRED` stores the return path, sends the
confirmation link (`auth.reauth`) and says so; the organizer opens the link, lands on
`/auth/reauth` (`features/auth/ReauthPage.tsx`), is sent back, and reveals again. The scan shows
inline (an `<img>` or a PDF `<iframe>` on an object URL, revoked on hide) under a watermark
naming the viewer and the time; nothing is cached. The packing checklist card beside it is live
since slice 048 (`packing.md`): the organizer's items, their counts and the add form. The Reports
page's documents tile reads the report. Evidence:
`web/<project>/preparation-live.png` (with the viewer open).

## Facts established by tests

- Worker: two requirements, three travelers missing; a blank name and a bad date are 400; states
  move the counts (one collected, one waived, one missing); an unknown traveler is 404, a bad
  state 400; a PDF scan is sealed (the object does not start with `%PDF-`) and marks the row
  collected; GIF, 13 MiB and an unknown traveler are refused; the reveal is 403
  `REAUTH_REQUIRED`; a sign-in token cannot confirm, Kim's reauth token cannot confirm Nate's
  session nor sign anyone in, anonymous cannot ask; once confirmed the link is spent, the PDF
  comes back with `no-store`, the reveal count is 1 and the timeline names the document; no scan
  is 404; a PNG scan replaces the PDF and loses its text chunk; the report's documents tile is
  100%; deleting the scan keeps the state and shreds the object; deleting the requirement shreds
  the rest and the items route is 404; a rename with required and a due date sticks. Leaders,
  travelers, guardians and strangers are 403 everywhere; anonymous 401; an unknown trip 404.
- Console unit: the live page lists requirements with counts, adds one (POST body), opens it,
  sets a state (PUT), uploads a scan (multipart `file`), and on a 403 reveal stores the return
  path, posts the reauth and says so; the reauth landing page posts the token once, stores
  nothing it should not, and navigates back; a dead link says so.
- Browser: add a requirement, open it, set Minji collected, upload a PNG for Juho, reveal →
  confirmation needed → the emailed link → back → reveal → the image shows under the watermark
  with the organizer's address; the reveal count reads 1; the Reports tile reads the completion.

## Not done

Per-traveler reminders to guardians ("Remind 3"); a document viewer that scales PDFs; the
owner-held key for tier 3 (ADR-0001 seam); sealed third-party links
(D27: driver, hotel) and the shred of a removed row's objects before the trip's own.
