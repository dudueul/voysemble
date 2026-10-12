// Copyright 2026- At Day. All rights reserved.
// Facts: a sealed note round-trips; two seals of the same text differ (fresh nonce); a tampered
// ciphertext is refused; no key outside local without the secret; a wrong-length secret is loud.

import { describe, expect, it } from 'vitest';
import { careKeyFrom, seal, unseal } from '../src/lib/care-crypto';

describe('care-note sealing', () => {
  it('round-trips and never repeats a nonce', async () => {
    const key = await careKeyFrom({ ENV_NAME: 'local' });
    expect(key).not.toBeNull();
    if (!key) return;
    const a = await seal(key, '{"allergies":"peanuts"}');
    const b = await seal(key, '{"allergies":"peanuts"}');
    expect(a.iv).not.toBe(b.iv);
    expect(a.ct).not.toBe(b.ct);
    expect(await unseal(key, a)).toBe('{"allergies":"peanuts"}');
    expect(await unseal(key, b)).toBe('{"allergies":"peanuts"}');
  });

  it('refuses a tampered ciphertext', async () => {
    const key = await careKeyFrom({ ENV_NAME: 'local' });
    if (!key) throw new Error('no key');
    const sealed = await seal(key, 'EpiPen in the red bag');
    const bytes = Uint8Array.from(atob(sealed.ct), (c) => c.charCodeAt(0));
    bytes[0] = (bytes[0] ?? 0) ^ 0xff;
    const tampered = { iv: sealed.iv, ct: btoa(String.fromCharCode(...bytes)) };
    await expect(unseal(key, tampered)).rejects.toBeTruthy();
  });

  it('uses the secret when set and refuses to guess elsewhere', async () => {
    const secret = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
    const key = await careKeyFrom({ CARE_NOTE_KEY: secret, ENV_NAME: 'production' });
    expect(key).not.toBeNull();
    expect(await careKeyFrom({ ENV_NAME: 'production' })).toBeNull();
    await expect(
      careKeyFrom({ CARE_NOTE_KEY: btoa('short'), ENV_NAME: 'production' }),
    ).rejects.toThrow(/32 bytes/);
  });
});
