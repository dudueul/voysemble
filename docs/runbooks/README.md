# MVP readiness: what to prepare, in what order

Status: 2026-10-13, after slice 083. This folder holds the runbooks for everything the code cannot
do by itself before a first real trip (the pilot, milestone P8 of
`docs/references/01_Voysemble_Prototype_Architecture.md` §26). Each runbook follows the
documentation rules (`docs/engineering/documentation-rules.md` rule 7): preconditions, exact
steps, how to verify, how to roll back, and the evidence to keep.

**Markets (D43, ADR-0010):** the United States and Korea first; Europe afterwards. A market is
where the group comes from, not where it travels. These runbooks prepare US and Korean law,
storefronts and payments; European items are marked as the later phase.

The product itself is built: the organizer console, the public site, the API and the Android and
iOS apps, all tested in CI with screenshots on every push (`docs/captures/README.md`). What is
missing is the outside world: accounts, keys, domains, stores and approvals that only the
founder can create, and a handful of features that depend on them.

## Who does what

- **Founder** (you): creates accounts, owns keys, decides policy, approves each live step. Never
  paste a key into a chat or a commit; put it where the runbook says (a Wrangler secret or a
  GitHub Actions secret).
- **Engineering** (the coding agent): writes the code that uses what you prepared, the deploy
  workflow, and the tests; never deploys to production or charges money without your explicit
  approval for that step (architecture reference §28.2).

## The order

Steps on the same line can run in parallel. Store accounts take the longest (identity checks of
days to weeks), so start them first even though they are used last.

| # | Step | Runbook | Who | Blocks |
|---|---|---|---|---|
| 1 | Start the Apple Developer and Google Play organization enrollments (D-U-N-S number first) | `apple.md` §1, `google.md` §1 | Founder | push, test builds, store |
| 2 | Cloudflare account, the two zones, a scoped API token for CI | `cloudflare.md` §1–3 | Founder | everything below |
| 3 | Create the staging and production resources (D1, R2, secrets) | `cloudflare.md` §4–5 | Founder, or engineering with the token | deploy |
| 4 | Email sending for both domains (SPF, DKIM, DMARC) | `cloudflare.md` §6 | Founder | sign-in outside local dev |
| 5 | Engineering: the deploy workflow, the Cloudflare email port | `cloudflare.md` §7 | Engineering | staging |
| 6 | First deploy to staging; sign in with a real email; run the demo script | `cloudflare.md` §8 | Both | pilot rehearsal |
| 7 | Push keys (APNs .p8, Firebase service account); engineering adds push | `apple.md` §3, `google.md` §3 | Founder, then engineering | live trip alerts |
| 8 | Test builds to TestFlight and Play internal testing | `apple.md` §4, `google.md` §4 | Both | pilot phones |
| 9 | Legal and policy answers, the pilot agreement with the school | `legal-and-pilot.md` | Founder (with counsel) | real people's data |
| 10 | Production deploy, on your explicit approval | `cloudflare.md` §9 | Founder approves | the pilot |
| — | Stripe (only if the pilot charges) | `stripe.md` | Founder | paid plans |

## Engineering work that does not wait on you

These close MVP gaps and need nothing from the list above. They are next in the slice queue
(`docs/planning/slices.md`):

- Done (slice 086): the head count card on a leader's live Today (`headcounts.md`).
- Done (slice 087): the durable offline pack; Today and the plan survive a restart with no
  signal (`docs/engineering/offline-pack.md`).
- Push plumbing: device token registration and a server send behind a port with a fixture, so
  only the keys are missing on the day you provide them.
- Rotating refresh tokens on the phones (`auth.native-refresh-rotation`).
- Crypto-shredding a trip's data when its retention ends (`retention.crypto-shred`, D20).
- The platform admin app with job repair (`admin.job-repair`, its own Worker behind Cloudflare
  Access, ADR-0008).

## What you will hand over, in one place

Keep this list in your password manager, not in the repository.

| Item | Where it goes | Runbook |
|---|---|---|
| Cloudflare account id | GitHub secret `CLOUDFLARE_ACCOUNT_ID` | `cloudflare.md` §3 |
| Cloudflare API token (scoped) | GitHub secret `CLOUDFLARE_API_TOKEN` | `cloudflare.md` §3 |
| D1 database ids (staging, production) | GitHub variables `D1_ID_STAGING`, `D1_ID_PRODUCTION` | `cloudflare.md` §4 |
| Care note key, media key (one pair per environment) | Wrangler secrets `CARE_NOTE_KEY`, `MEDIA_KEY` | `cloudflare.md` §5 |
| Web Analytics token (optional) | GitHub secret `CF_ANALYTICS_TOKEN` | `cloudflare.md` §8 |
| Apple Team ID | Wrangler var `APPLE_APP_IDS` (`TEAMID.com.voysemble.app`); Xcode signing | `apple.md` §2 |
| APNs key (.p8), key id | Wrangler secrets `APNS_KEY`, `APNS_KEY_ID`, `APNS_TEAM_ID` | `apple.md` §3 |
| Android signing fingerprints (SHA-256) | Wrangler var `ANDROID_CERT_SHA256` | `google.md` §2 |
| Firebase service account (JSON) | Wrangler secret `FCM_SERVICE_ACCOUNT` | `google.md` §3 |
| Stripe keys (only if charging) | Wrangler secrets `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | `stripe.md` |

The secret names for push and Stripe are the names the code will read; the code for them is
written in the slices that add those features, against these names.
