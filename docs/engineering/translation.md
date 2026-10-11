# Announcement translation through the AI port (slice 015)

Implements D16's KO<->EN machine translation and the leader edit rule of ADR-0009 on top of the
AI boundary of ADR-0006: one server-side translation per announcement, computed at publish,
cached on the row, labelled "machine translation" with the original always first, replaceable by
a bilingual staff member and then labelled "edited by <name>". Exercised by
`apps/api-worker/test/ai.test.ts`, the translation cases in `announcements.test.ts`, the
Communication unit test, `e2e/announcements.spec.ts`, and `AnnouncementsSyncTest` in core.

## The port (`apps/api-worker/src/ai/AiPort.ts`)

| Implementation | When | Behaviour |
|---|---|---|
| `WorkersAiPort` | the `AI` binding exists (preview, staging, production) | `@cf/meta/m2m100-1.2b` with the locale pair; through AI Gateway when `AI_GATEWAY_ID` is set; output validated as a non-empty string; any error or junk → null. |
| `FixtureAiPort` | local and tests (no binding, `ENV_NAME=local`) | A canned KO/EN dictionary for the sample phrases; anything else → null. Deterministic, so E2E and screenshots are stable. |
| `DisabledAiPort` | a deployed environment without the binding | Always null: honest "no translation", never a different behaviour. |

Null never fails a publish; the announcement simply carries `translation: null`.

ADR-0006 placed the interface in `packages/effect-runtime`. That package does not exist, so the
port lives beside its only consumer in the Worker until a second Worker needs it (recorded in
the ADR).

## Behaviour

- Source locale is detected from the body (Hangul → `ko`, else `en`); the target is the other
  supported locale. Titles are not translated this slice.
- `POST .../announcements` translates once and stores `{ locale, body, provider: 'machine' }`.
- `PUT .../announcements/{id}/translation` (owner, organizer, participating leader) replaces the
  text with `provider: 'edited'` and the editor's display name; travelers get 403; unknown id 404.
- Readers get `translation` on every announcement; clients show the original first, then the
  labelled translation.

## Storage (OrgDurableObject, schema version 5)

`announcements` gains `translated_body`, `translated_locale`, `translation_provider`,
`translation_edited_by`. One translation per announcement; 38 phones never translate the same
text (ADR-0006).

## Clients

- Console: the announcement row shows the block with "Machine translation · 한국어/English" or
  "Translation edited by <name> · …".
- KMP core: `AnnouncementTranslationDto`, `AnnouncementItem.translationLocale`,
  `translationEditedBy`, and `translationLabel`; Android and iOS bulletin screens use the label.
  The fixture feed keeps its canned Korean translation.

## Configuration

Set `AI_GATEWAY_ID` (var or secret) in each named environment to route through AI Gateway, which
gives logging without PII, caching, rate limits, and the kill switch the ADR requires. Without it
the binding is called directly.

## Facts established by tests

- Port: Hangul detects as `ko`; the Workers AI port sends the model, the locale pair, and the
  gateway, trims the answer, and returns null on blank output or a thrown error; the fixture
  port answers its pairs both ways and nothing else; selection follows binding and environment.
- Worker: an English publish carries the Korean machine translation; a Korean publish carries the
  English one; an unknown phrase carries null; a leader's edit is labelled `edited` with "Kim";
  a traveler cannot edit (403); unknown announcement 404.
- Console unit and browser: the published announcement shows the labelled Korean block.
- Core: the merged item carries the translation body, locale, and the "edited by" label.

## Not done

Title translation, per-reader locale selection (both directions stored), guardian parent-safe
copy, on-device translation for chat (`AiPort` in KMP core), usage rollups per organization.
