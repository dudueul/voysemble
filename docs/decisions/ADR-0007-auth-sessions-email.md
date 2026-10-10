# ADR-0007: Authentication, sessions, invitations, email delivery

Status: accepted (2026-10-10)

## Decision

### Libraries
- `arctic` for OAuth/OIDC provider clients (Apple, Google). `@oslojs/crypto`, `@oslojs/encoding`
  for primitives. No auth framework, no auth SaaS. Our own session, device, invitation tables in
  global D1.
- Rationale: requirements are custom (scoped invitations, guest links, device records, org and
  trip membership). Three small audited packages beat a framework we would fight.

### Flows
- Web (organizer console): Apple + Google OIDC, authorization-code + PKCE, server-side exchange,
  allowlisted redirect URIs, `state` + `nonce` stored in a short-lived signed cookie. Email magic
  link as fallback. Passkeys later.
- Mobile: native Sign in with Apple (ASAuthorizationController) and Google Credential Manager.
  The app sends the provider ID token to `POST /v1/auth/native`. Server verifies issuer, audience,
  nonce, expiry, and signature against cached JWKS, then creates a session. No webview login.
- Admin console: Cloudflare Access in front; admin Worker verifies the Access JWT (issuer,
  audience, signature, expiry) and requires a `staff` row. Reauthentication for dangerous actions.
- Guests without accounts (driver, venue, family viewer): sealed role link
  `/t/<link_id>#k=<key>` per doc 00 §4.4. Key in URL fragment only. Expires trip end + 24 h.
  Revocable. Slice re-sealed by the organizer's client on trip change.

### Sessions
- Opaque 256-bit random token. Only its SHA-256 stored in `sessions`
  (`user_id, device_id, created_at, expires_at, last_seen_at, revoked_at, ip_hash, ua_family`).
- Web: host-only `Secure; HttpOnly; SameSite=Lax` cookie. 30-day idle expiry, 90-day absolute.
- Mobile: refresh token in Keychain/Keystore, rotated on use (reuse detection revokes the family);
  15-minute HMAC-SHA256 access token carrying `user_id, session_id, exp`.
- Revocation = row update; realtime tickets and sync scopes recheck session on each issue.

### Invitations
- Code shape like `ONE-7HK2`: random, stored hashed, scoped `{organization_id, trip_id, role,
  max_uses, expires_at, created_by}`. Redeem creates `trip_memberships` server-side. Role comes
  from the invitation, never from the client.
- Guardian links require an organizer-issued invitation naming the traveler.

### Email delivery
- Cloudflare Email Sending (Workers `send_email` binding / Email Service) is the primary
  transport. Owned domain with SPF, DKIM, DMARC configured. Requires the Email Service feature
  to be available on the account at implementation time; verify GA/beta status then.
- `EmailPort` interface with impls `CloudflareEmailPort`, `FixtureEmailPort` (captures to a test
  mailbox), and a fallback `ResendEmailPort` kept behind a flag only if the Cloudflare feature
  is unavailable for the account.
- Templates: magic link, invitation, announcement digest, billing receipts (link to Stripe),
  security notices. KO/JA/EN. Generic bodies: no PII beyond the recipient's name.

## Consequences
- We own password-less auth code paths: OIDC verification, session rotation, invitation redeem.
  Each gets property tests (replay, reuse, expiry, cross-org).
- Email deliverability depends on domain setup; a staging domain is needed before magic links
  work outside fixtures.
