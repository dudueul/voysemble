// Copyright 2026- At Day. All rights reserved.
//
// PushPort (D29, slice 088; ADR-0008 "Push: APNs and FCM from the Worker, fixture adapter first").
// The Worker composes a message per notification row and device; a port delivers it. Adapters:
// FixturePushPort (local and tests: writes to the DEV_MAILBOX KV), ApnsPushPort and FcmPushPort
// (src/push/apns.ts, fcm.ts) behind RoutingPushPort, and UnconfiguredPushPort when a platform has
// no keys. A message carries the notification's title, body and reference, never a location or a
// care fact (the notification rule). Never log a token.

import type { Bindings } from '../env';
import { ApnsPushPort } from './apns';
import { FcmPushPort } from './fcm';

export type PushMessage = {
  platform: 'ios' | 'android';
  token: string;
  /** iOS only: which APNs host serves this token. */
  apnsEnvironment: 'sandbox' | 'production' | null;
  lane: 'priority' | 'normal';
  title: string;
  body: string;
  /** Opaque routing data for the app: the notification and what it points at. */
  data: { notificationId: string; tripId: string; kind: string; refType: string; refId: string };
};

/** `invalid-token`: the platform says the token is dead; the caller forgets the device. */
export type PushResult = 'sent' | 'invalid-token' | 'failed' | 'unconfigured';

export interface PushPort {
  send(message: PushMessage): Promise<PushResult>;
}

/** No keys for this platform in this environment: nothing is sent, the row is marked so. */
export class UnconfiguredPushPort implements PushPort {
  async send(): Promise<PushResult> {
    return 'unconfigured';
  }
}

/**
 * Stores messages under `push:<token>:<timestamp>` for an hour. Local and test use only. A token
 * that starts with `dead-` answers `invalid-token`, one that starts with `fail-` answers `failed`,
 * so tests can drive both paths.
 */
export class FixturePushPort implements PushPort {
  constructor(private readonly mailbox: KVNamespace) {}

  async send(message: PushMessage): Promise<PushResult> {
    if (message.token.startsWith('dead-')) return 'invalid-token';
    if (message.token.startsWith('fail-')) return 'failed';
    const key = `push:${message.token}:${Date.now()}:${crypto.randomUUID().slice(0, 8)}`;
    await this.mailbox.put(key, JSON.stringify(message), { expirationTtl: 3600 });
    return 'sent';
  }

  /** Test helper: every message stored for a token, oldest first. */
  static async all(mailbox: KVNamespace, token: string): Promise<PushMessage[]> {
    const list = await mailbox.list({ prefix: `push:${token}:` });
    const out: PushMessage[] = [];
    for (const k of list.keys.map((x) => x.name).sort()) {
      const raw = await mailbox.get(k);
      if (raw) out.push(JSON.parse(raw) as PushMessage);
    }
    return out;
  }
}

/** iOS to APNs, Android to FCM; a platform without keys answers `unconfigured`. */
export class RoutingPushPort implements PushPort {
  constructor(
    private readonly ios: PushPort,
    private readonly android: PushPort,
  ) {}

  send(message: PushMessage): Promise<PushResult> {
    return message.platform === 'ios' ? this.ios.send(message) : this.android.send(message);
  }
}

export function createPushPort(env: Bindings): PushPort {
  if (env.DEV_MAILBOX) return new FixturePushPort(env.DEV_MAILBOX);
  const ios =
    env.APNS_KEY && env.APNS_KEY_ID && env.APNS_TEAM_ID
      ? new ApnsPushPort({
          keyPem: env.APNS_KEY,
          keyId: env.APNS_KEY_ID,
          teamId: env.APNS_TEAM_ID,
          topic: env.APNS_TOPIC ?? 'com.voysemble.app',
        })
      : new UnconfiguredPushPort();
  let android: PushPort = new UnconfiguredPushPort();
  if (env.FCM_SERVICE_ACCOUNT) {
    try {
      android = new FcmPushPort(JSON.parse(env.FCM_SERVICE_ACCOUNT));
    } catch {
      console.error('FCM_SERVICE_ACCOUNT is not JSON; Android push stays unconfigured');
    }
  }
  return new RoutingPushPort(ios, android);
}
