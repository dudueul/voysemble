// Copyright 2026- At Day. All rights reserved.
//
// Sealing for care notes (D27, tier 2 PII): AES-256-GCM through WebCrypto with a fresh 96-bit
// nonce per write. The key comes from the CARE_NOTE_KEY secret (32 bytes, base64); a Durable
// Object row holds only the nonce and the ciphertext, so a storage dump without the secret is
// noise. Locally (ENV_NAME "local": dev server and tests) a fixed development key stands in
// when the secret is unset; named environments without the secret refuse care-note writes.

export type Sealed = { iv: string; ct: string };

/** Fixed development key: 32 bytes, local only, never valid for a named environment. */
const DEV_KEY = 'voysemble-local-care-note-key-32';

function bytesOf(b64: string): Uint8Array {
  const std = b64.replaceAll('-', '+').replaceAll('_', '/');
  const padded = std + '='.repeat((4 - (std.length % 4)) % 4);
  return Uint8Array.from(atob(padded), (ch) => ch.charCodeAt(0));
}

function b64Of(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

/**
 * The AES key for this deployment, or null when no key is configured (named environment without
 * the secret). A malformed secret throws so the misconfiguration is loud.
 */
export async function careKeyFrom(env: {
  CARE_NOTE_KEY?: string;
  ENV_NAME?: string;
}): Promise<CryptoKey | null> {
  let raw: Uint8Array;
  if (env.CARE_NOTE_KEY) {
    raw = bytesOf(env.CARE_NOTE_KEY);
    if (raw.length !== 32) throw new Error('CARE_NOTE_KEY must decode to 32 bytes');
  } else if (env.ENV_NAME === 'local') {
    raw = new TextEncoder().encode(DEV_KEY);
  } else {
    return null;
  }
  return crypto.subtle.importKey('raw', raw as BufferSource, { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ]);
}

export async function seal(key: CryptoKey, plaintext: string): Promise<Sealed> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plaintext),
  );
  return { iv: b64Of(iv), ct: b64Of(new Uint8Array(ct)) };
}

/** Throws when the ciphertext or the nonce was altered (GCM authentication). */
export async function unseal(key: CryptoKey, sealed: Sealed): Promise<string> {
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: bytesOf(sealed.iv) as BufferSource },
    key,
    bytesOf(sealed.ct) as BufferSource,
  );
  return new TextDecoder().decode(pt);
}
