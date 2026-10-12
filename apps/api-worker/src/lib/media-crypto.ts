// Copyright 2026- At Day. All rights reserved.
//
// Sealing for photo bytes (D18, ADR-0001 tier 3): AES-256-GCM through WebCrypto, a fresh 96-bit
// nonce per object, stored as `nonce || ciphertext` in R2. The key is the MEDIA_KEY secret
// (32 bytes, base64; `wrangler secret put MEDIA_KEY` per named environment); locally (ENV_NAME
// "local") a fixed development key stands in; a named environment without the secret refuses
// uploads and reads (503), never a plaintext fallback. The per-organization DEK keyring of
// ADR-0005 replaces this single key when it lands; the object layout stays.

/** Fixed development key: 32 bytes, local only, never valid for a named environment. */
const DEV_KEY = 'voysemble-local-media-key-32byte';
const NONCE_BYTES = 12;

function bytesOf(b64: string): Uint8Array {
  const std = b64.replaceAll('-', '+').replaceAll('_', '/');
  const padded = std + '='.repeat((4 - (std.length % 4)) % 4);
  return Uint8Array.from(atob(padded), (ch) => ch.charCodeAt(0));
}

/** The AES key for this deployment, or null when a named environment has no secret. */
export async function mediaKeyFrom(env: {
  MEDIA_KEY?: string;
  ENV_NAME?: string;
}): Promise<CryptoKey | null> {
  let raw: Uint8Array;
  if (env.MEDIA_KEY) {
    raw = bytesOf(env.MEDIA_KEY);
    if (raw.length !== 32) throw new Error('MEDIA_KEY must decode to 32 bytes');
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

export async function sealBytes(key: CryptoKey, plain: Uint8Array): Promise<Uint8Array> {
  const nonce = crypto.getRandomValues(new Uint8Array(NONCE_BYTES));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, plain as BufferSource),
  );
  const out = new Uint8Array(NONCE_BYTES + ct.length);
  out.set(nonce, 0);
  out.set(ct, NONCE_BYTES);
  return out;
}

/** Throws when the object was altered (GCM authentication) or is too short to carry a nonce. */
export async function unsealBytes(key: CryptoKey, sealed: Uint8Array): Promise<Uint8Array> {
  if (sealed.length < NONCE_BYTES + 16) throw new Error('sealed object too short');
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: sealed.subarray(0, NONCE_BYTES) as BufferSource },
    key,
    sealed.subarray(NONCE_BYTES) as BufferSource,
  );
  return new Uint8Array(pt);
}
