# ADR-0006: AI boundary — Workers AI server-side, platform-native ML on device

Status: accepted (2026-10-10)

## Context

Doc 00 principle 4: AI on device by default; cloud AI only on the owner's own Cloudflare account.
Docs 01/02: AI may explain, never decide attendance, invent flight facts, or mutate the graph.
Founder asked how mobile AI works and how to keep cost near zero.

## Decision

### Server side: Workers AI, through AI Gateway, organizer-facing tasks only

| Task | Trigger | Output | Status at start |
|---|---|---|---|
| Ingest booking emails/PDFs into segment suggestions | Organizer pastes/forwards/drops into a trip in the web console | JSON matching a Zod schema, shown as a suggestion card with confirm/edit/dismiss. Never auto-filed | `simulated` fixture first, then `working` |
| Broadcast translation of announcements (KO/JA/EN) | Organizer publishes an announcement | Per-language text cached per `announcement_id + lang`. Original always shown | `simulated` -> `working` |
| Image pre-moderation flag on quarantine candidate | Upload validation workflow | Flags only (nsfw, violence, low-quality). Human decides | `simulated` -> `working` |
| Disruption proposal explanation | Deterministic impact engine finishes | Free text in a separate `explanation` field, labeled AI | Inside the graph slice |

Deferred: traveler Q&A assistant over trip context (prompt-injection surface), speech-to-text
announcements. Rejected for now: embeddings/semantic search (doc 01: measured need first).

Guardrails:
- One `AiAdapter` interface in `packages/effect-runtime`. Impls: `FixtureAiAdapter`, `WorkersAiAdapter`.
- All calls via Cloudflare AI Gateway: logging without PII, response caching, rate limits, per-org
  neuron budget, global kill switch flag. Budget exhaustion degrades to "AI unavailable", never to
  a different behavior.
- Context is permission-filtered before inference. Never send a whole org or trip.
- Output validated with Zod. Invalid output = no suggestion, logged as a provider error.
- AI never writes canonical data, never participates in authorization, billing, attendance,
  or graph mutation.
- UI labels every AI output "AI suggestion" / "AI translation" with the source visible.

### Mobile: platform-native on-device ML, zero inference cost

| Task | iOS | Android | Cost |
|---|---|---|---|
| Translate chat / ad-hoc text | Apple Translation framework | ML Kit Translation | $0, offline |
| OCR for passport MRZ and document capture | Vision framework | ML Kit Text Recognition | $0, offline |
| Image pre-check before upload (blur, obvious NSFW) | Vision / Core ML | ML Kit Image Labeling | $0, offline |
| Speech -> text | Speech framework | SpeechRecognizer | $0 |
| Small on-device LLM (summarize cached trip, Q&A) | Apple Foundation Models (iOS 26+) | Gemini Nano via ML Kit GenAI (limited devices) | $0, optional capability |

Rules:
- No bundled LLM weights (size, battery, update burden). No llama.cpp / MediaPipe LLM.
- KMP core exposes `AiPort` with `OnDeviceAiPort` (expect/actual per platform), `RemoteAiPort`
  (our API -> Workers AI), `DisabledAiPort`. Policy per task: on-device first; remote only if the
  task allows it and org budget permits; otherwise disabled with honest UI.
- The app never depends on an on-device LLM being present.
- Broadcast content is translated once server-side and cached; 38 phones do not each translate
  the same announcement.

## Consequences

- Mobile AI volume (translate/OCR/vision) costs nothing and keeps data on the phone.
- Workers AI volume is organizer-side and low; the free daily neuron allowance covers the
  prototype. Measured usage goes into `cost_rollups`.
- Two AI surfaces to test: fixture-based on the server; device-based tests on physical hardware.
