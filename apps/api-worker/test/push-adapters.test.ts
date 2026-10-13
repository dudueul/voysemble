// Copyright 2026- At Day. All rights reserved.
// Facts (slice 088): the APNs provider token is an ES256 JWT (kid, iss, iat) that verifies with
// the key's public half and is reused between sends; a priority row goes to the sandbox host with
// apns-priority 10, the topic and the time-sensitive level, a normal one with priority 5; 410 and
// 400 BadDeviceToken mean a dead token, 500 a failure. The FCM assertion is an RS256 JWT (iss,
// scope, aud, iat, exp) exchanged for an access token reused between sends; the message names the
// project, the lane's channel and priority; 404 and UNREGISTERED mean a dead token, other 400s a
// failure. Each adapter leaves the other platform unconfigured.

import { describe, expect, it } from 'vitest';
import { ApnsPushPort } from '../src/push/apns';
import { FcmPushPort } from '../src/push/fcm';
import { base64url, pemToDer } from '../src/push/jwt';
import type { PushMessage } from '../src/push/PushPort';

async function pemOf(key: CryptoKey): Promise<string> {
  const der = new Uint8Array((await crypto.subtle.exportKey('pkcs8', key)) as ArrayBuffer);
  let bin = '';
  for (const b of der) bin += String.fromCharCode(b);
  const b64 = btoa(bin).replace(/(.{64})/g, '$1\n');
  return `-----BEGIN PRIVATE KEY-----\n${b64}\n-----END PRIVATE KEY-----\n`;
}

function decode(part: string): Record<string, unknown> {
  const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4)));
}

function bytesOf(part: string): Uint8Array {
  const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

const message = (over: Partial<PushMessage> = {}): PushMessage => ({
  platform: 'ios',
  token: 'device-token-1',
  apnsEnvironment: 'sandbox',
  lane: 'priority',
  title: 'Head count: Bus A',
  body: 'Kim is counting Bus A now. Find your leader.',
  data: {
    notificationId: 'n1',
    tripId: 't1',
    kind: 'headcount_call',
    refType: 'headcount',
    refId: 'h1',
  },
  ...over,
});

type Call = { url: string; init: RequestInit };

describe('APNs adapter', () => {
  it('signs, caches, routes and reads the answers', async () => {
    const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
      'sign',
      'verify',
    ])) as CryptoKeyPair;
    const pem = await pemOf(pair.privateKey);
    // A PEM pasted with literal \n sequences reads the same.
    expect(base64url(pemToDer(pem.replace(/\n/g, '\\n')))).toBe(base64url(pemToDer(pem)));
    const calls: Call[] = [];
    let status = 200;
    let reply = '';
    const port = new ApnsPushPort(
      { keyPem: pem, keyId: 'KEY1234567', teamId: 'TEAM123456', topic: 'com.voysemble.app' },
      async (input, init) => {
        calls.push({ url: String(input), init: init ?? {} });
        return new Response(reply, { status });
      },
      () => 1_800_000_000,
    );
    expect(await port.send(message())).toBe('sent');
    const first = calls[0];
    expect(first?.url).toBe('https://api.sandbox.push.apple.com/3/device/device-token-1');
    const headers = first?.init.headers as Record<string, string>;
    expect(headers['apns-priority']).toBe('10');
    expect(headers['apns-topic']).toBe('com.voysemble.app');
    expect(headers['apns-push-type']).toBe('alert');
    const payload = JSON.parse(String(first?.init.body));
    expect(payload.aps.alert).toEqual({
      title: 'Head count: Bus A',
      body: 'Kim is counting Bus A now. Find your leader.',
    });
    expect(payload.aps['interruption-level']).toBe('time-sensitive');
    expect(payload.refType).toBe('headcount');
    const jwt = headers.authorization?.replace('bearer ', '') ?? '';
    const [h = '', c = '', sig = ''] = jwt.split('.');
    expect(decode(h)).toEqual({ kid: 'KEY1234567', alg: 'ES256' });
    expect(decode(c)).toEqual({ iss: 'TEAM123456', iat: 1_800_000_000 });
    expect(
      await crypto.subtle.verify(
        { name: 'ECDSA', hash: 'SHA-256' },
        pair.publicKey,
        bytesOf(sig),
        new TextEncoder().encode(`${h}.${c}`),
      ),
    ).toBe(true);
    // Normal lane, production host, the same provider token.
    expect(await port.send(message({ lane: 'normal', apnsEnvironment: 'production' }))).toBe(
      'sent',
    );
    const second = calls[1];
    expect(second?.url).toBe('https://api.push.apple.com/3/device/device-token-1');
    expect(((second?.init.headers ?? {}) as Record<string, string>)['apns-priority']).toBe('5');
    expect(((second?.init.headers ?? {}) as Record<string, string>).authorization).toBe(
      headers.authorization,
    );
    expect(JSON.parse(String(second?.init.body)).aps['interruption-level']).toBe('active');
    // Answers.
    status = 410;
    expect(await port.send(message())).toBe('invalid-token');
    status = 400;
    reply = JSON.stringify({ reason: 'BadDeviceToken' });
    expect(await port.send(message())).toBe('invalid-token');
    reply = JSON.stringify({ reason: 'PayloadTooLarge' });
    expect(await port.send(message())).toBe('failed');
    status = 500;
    expect(await port.send(message())).toBe('failed');
    expect(await port.send(message({ platform: 'android' }))).toBe('unconfigured');
  });
});

describe('FCM adapter', () => {
  it('exchanges a signed assertion, caches the token, routes by lane and reads the answers', async () => {
    const pair = (await crypto.subtle.generateKey(
      {
        name: 'RSASSA-PKCS1-v1_5',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: 'SHA-256',
      },
      true,
      ['sign', 'verify'],
    )) as CryptoKeyPair;
    const pem = await pemOf(pair.privateKey);
    const calls: Call[] = [];
    let status = 200;
    let reply = '{}';
    const port = new FcmPushPort(
      {
        project_id: 'voysemble-test',
        client_email: 'push@voysemble-test.iam.gserviceaccount.com',
        private_key: pem,
      },
      async (input, init) => {
        calls.push({ url: String(input), init: init ?? {} });
        if (String(input).startsWith('https://oauth2.googleapis.com/token')) {
          return Response.json({ access_token: 'ya29.test', expires_in: 3600 });
        }
        return new Response(reply, { status });
      },
      () => 1_800_000_000,
    );
    const android = message({ platform: 'android', apnsEnvironment: null, lane: 'normal' });
    expect(await port.send(android)).toBe('sent');
    const [tokenCall, sendCall] = calls;
    expect(tokenCall?.url).toBe('https://oauth2.googleapis.com/token');
    const form = new URLSearchParams(String(tokenCall?.init.body));
    expect(form.get('grant_type')).toBe('urn:ietf:params:oauth:grant-type:jwt-bearer');
    const [h = '', c = '', sig = ''] = (form.get('assertion') ?? '').split('.');
    expect(decode(h)).toEqual({ typ: 'JWT', alg: 'RS256' });
    expect(decode(c)).toEqual({
      iss: 'push@voysemble-test.iam.gserviceaccount.com',
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat: 1_800_000_000,
      exp: 1_800_003_600,
    });
    expect(
      await crypto.subtle.verify(
        { name: 'RSASSA-PKCS1-v1_5' },
        pair.publicKey,
        bytesOf(sig),
        new TextEncoder().encode(`${h}.${c}`),
      ),
    ).toBe(true);
    expect(sendCall?.url).toBe(
      'https://fcm.googleapis.com/v1/projects/voysemble-test/messages:send',
    );
    expect(((sendCall?.init.headers ?? {}) as Record<string, string>).authorization).toBe(
      'Bearer ya29.test',
    );
    const body = JSON.parse(String(sendCall?.init.body));
    expect(body.message.token).toBe('device-token-1');
    expect(body.message.android).toEqual({
      priority: 'NORMAL',
      notification: { channel_id: 'lane.normal' },
    });
    expect(body.message.data.refId).toBe('h1');
    // Priority lane; the access token is reused (no second exchange).
    expect(await port.send({ ...android, lane: 'priority' })).toBe('sent');
    expect(calls.filter((x) => x.url.startsWith('https://oauth2')).length).toBe(1);
    expect(JSON.parse(String(calls.at(-1)?.init.body)).message.android).toEqual({
      priority: 'HIGH',
      notification: { channel_id: 'lane.priority' },
    });
    // Answers.
    status = 404;
    expect(await port.send(android)).toBe('invalid-token');
    status = 400;
    reply = JSON.stringify({ error: { details: [{ errorCode: 'UNREGISTERED' }] } });
    expect(await port.send(android)).toBe('invalid-token');
    reply = JSON.stringify({ error: { details: [{ errorCode: 'INVALID_ARGUMENT' }] } });
    expect(await port.send(android)).toBe('failed');
    expect(await port.send(message())).toBe('unconfigured');
  });
});
