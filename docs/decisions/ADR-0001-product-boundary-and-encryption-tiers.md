# ADR-0001: Product boundary and encryption tiers

Status: accepted (2026-10-10)

## Context

Reference docs conflict. `00_travel-agency-like.md` describes a single-owner, end-to-end-encrypted
agency tool with no staff accounts. `01`–`03` describe a multi-role group-travel product
(travelers, guardians, leaders, organizers, platform admin) with Stripe, mobile apps, and a
platform console. The approved screens are the multi-role product.

Operator reality: one founder runs the platform. Customers are organizations (schools, choirs,
clubs) that run trips repeatedly, sometimes years apart.

## Decision

1. Build the multi-role product from docs 01–03. Doc 00 is the security-posture source.
2. "Tenant" = organization as a data boundary. Every org-scoped row carries `organization_id`.
   It is not a multi-operator business model.
3. Platform administration = Cloudflare Access + one staff identity + audit log + reauth for
   dangerous actions. No pretend dual control. Narrow repair RPCs only. No SQL shell.
4. Encryption is tiered, not full E2E:

| Tier | Data | Store | Protection |
|---|---|---|---|
| 1 Ops | itinerary, announcements, acks, headcounts, assignments, journey graph, chat archive | OrgDO SQLite plaintext | Server must read for role filtering, sync deltas, fanout, propagation, moderation |
| 2 PII | passport number, DOB, medical, dietary, emergency contacts, home address | OrgDO SQLite, AES-256-GCM ciphertext | Per-org DEK, wrapped by Worker-secret KEK. Decrypt only in request path for an authorized actor. AAD binds `org|table|column|rowId` |
| 3 Documents | passport scans, consent forms, medical attachments | R2 ciphertext | Same DEK at first. Seam for owner-held key (org passphrase, client-side decrypt) later |
| 4 Ephemeral | live coordinates, presence | TripLiveDO memory/SQLite with TTL | Minimize and expire. Never canonical |

5. Rules kept verbatim from doc 00: minimum plaintext; no card data ever; auth never weakened in
   dev; bounded parsers for all external input; strict CSP; never delete silently; all external
   data untrusted.
6. Payments: Stripe hosted Checkout + Customer Portal, web console only, organizers only. Mobile
   consumes entitlements. No card data anywhere in our systems.
7. Repeat trips: "clone roster from previous trip" requires fresh consent and document checks.
   Retention prompts the owner; deletion is an explicit action.

## Consequences

- Server-side compromise exposes Tier 1 and, while a request is in flight, Tier 2. Database or
  backup leak exposes only Tier 1.
- Owner-held-key mode for Tier 3 means lost passphrase = lost documents. Deferred, seam only.
- No multi-staff RBAC engine in the prototype. Add when a second staff member exists.
