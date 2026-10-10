# ADR-0005: Key hierarchy, rotation policy, post-quantum posture

Status: accepted (2026-10-10)

## Hierarchy

```
KEK (Worker secret, versioned: KEK_V1, KEK_V2 ...)
  └─ wraps DEK[org][version]            keyring rows in OrgDO (small)
       └─ encrypts Tier 2 fields and Tier 3 blobs
```

Ciphertext envelope (binary): `magic 'VY1' | keyId | keyVersion | nonce(12) | ct+tag`.
AAD = `organization_id | table | column | row_id` (fields) or `organization_id | objectKey` (blobs).
Algorithm: AES-256-GCM. Wrapping: AES-256-GCM over the raw DEK with AAD `org|keyVersion`.

## Rotation policy

| Event | Action | Touches data? |
|---|---|---|
| Rotate KEK (yearly or secret leak) | Rewrap every DEK under the new KEK | No. Seconds |
| Rotate org DEK (routine or org request) | Add DEK v(n+1). New writes use it. Old rows readable by `keyVersion` | No |
| Retire an old DEK version | Background Workflow re-encrypts rows in chunks, resumable cursor. Refuse retirement while any row references the version | Yes, async |
| DEK compromise | New version + forced full re-encrypt | Yes |
| Org deletion | Delete all DEK versions -> crypto-shred. Also neutralizes PITR and backups | No |

Past records always readable: the keyring keeps every version until its reference count is zero.
Lazy rewrite on next write of a row keeps most rows migrating for free.

## Post-quantum posture ("PQ-ready by construction")

- At rest: AES-256-GCM, Grover-resistant. Nothing to change.
- Wrapping: symmetric only. No RSA/ECDH-wrapped keys at rest, so no harvest-now-decrypt-later.
- Tokens: HMAC-SHA256 session, sync, upload, and realtime tickets. We mint no RS256/ES256 JWTs.
- Transit: Cloudflare edge TLS already negotiates hybrid X25519 + ML-KEM.
- When asymmetric is needed (owner-held key sharing to a role link): hybrid X25519 + ML-KEM-768
  HPKE-style. Use `@noble/post-quantum` if the Workers runtime lacks ML-KEM in WebCrypto at
  implementation time. Verify then.
- Accepted non-PQ externals: Apple/Google OIDC (RS256), passkeys (ECDSA), Stripe (HMAC, fine).
