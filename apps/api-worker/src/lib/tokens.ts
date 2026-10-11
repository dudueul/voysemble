// Copyright 2026- At Day. All rights reserved.
//
// Random tokens and their storage hashes (ADR-0007 "Sessions", "Invitations").
// Rules: tokens are random, never derived; only SHA-256 hashes are stored; comparisons happen on
// hashes so timing is independent of the secret.

import { sha256 } from '@oslojs/crypto/sha2';
import { encodeBase64urlNoPadding, encodeHexLowerCase } from '@oslojs/encoding';

/** 256-bit opaque token, base64url (43 chars). Used for sessions and magic links. */
export function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return encodeBase64urlNoPadding(bytes);
}

export function hashToken(token: string): string {
  return encodeHexLowerCase(sha256(new TextEncoder().encode(token)));
}

/** Unambiguous alphabet: no 0/O, 1/I/L. 32 symbols, 8 chars = 40 bits. */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** Human-typed invite code, formatted `XXXX-XXXX`. */
export function randomInviteCode(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < 8; i++) {
    // biome-ignore lint/style/noNonNullAssertion: index is within the fixed-length buffer
    out += CODE_ALPHABET[bytes[i]! % CODE_ALPHABET.length];
    if (i === 3) out += '-';
  }
  return out;
}

/** Canonical form for hashing: upper-case, no separators. `k7px-4mdq` and `K7PX4MDQ` match. */
export function normalizeInviteCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function hashInviteCode(code: string): string {
  return hashToken(`invite:${normalizeInviteCode(code)}`);
}
