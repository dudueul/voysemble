// Copyright 2026- At Day. All rights reserved.
//
// The two signed tokens push needs, with WebCrypto only (no dependency): ES256 for the APNs
// provider token (the .p8 key) and RS256 for the Google OAuth assertion (the service account's
// key). Both keys arrive as PKCS#8 PEM. Owns encoding and signing; never logs a key or a token.

const encoder = new TextEncoder();

export function base64url(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = '';
  for (const b of view) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64urlJson(value: unknown): string {
  return base64url(encoder.encode(JSON.stringify(value)));
}

/** The DER bytes of a PKCS#8 PEM ("-----BEGIN PRIVATE KEY-----"); literal "\\n" sequences are tolerated. */
export function pemToDer(pem: string): ArrayBuffer {
  const body = pem
    .replace(/\\n/g, '\n')
    .replace(/-----BEGIN [A-Z ]+-----/, '')
    .replace(/-----END [A-Z ]+-----/, '')
    .replace(/\s+/g, '');
  const bin = atob(body);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

export type JwtAlg = 'ES256' | 'RS256';

/** header.claims.signature, signed with the PKCS#8 PEM key. ES256 signatures are raw r||s (JWS). */
export async function signJwt(
  alg: JwtAlg,
  keyPem: string,
  header: Record<string, unknown>,
  claims: Record<string, unknown>,
): Promise<string> {
  const input = `${base64urlJson({ ...header, alg })}.${base64urlJson(claims)}`;
  const algorithm =
    alg === 'ES256'
      ? { import: { name: 'ECDSA', namedCurve: 'P-256' }, sign: { name: 'ECDSA', hash: 'SHA-256' } }
      : {
          import: { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
          sign: { name: 'RSASSA-PKCS1-v1_5' },
        };
  const key = await crypto.subtle.importKey('pkcs8', pemToDer(keyPem), algorithm.import, false, [
    'sign',
  ]);
  const signature = await crypto.subtle.sign(algorithm.sign, key, encoder.encode(input));
  return `${input}.${base64url(signature)}`;
}
