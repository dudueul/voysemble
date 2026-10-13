// Copyright 2026- At Day. All rights reserved.
//
// APNs over HTTP/2 with a token-based provider key (the .p8 of docs/runbooks/apple.md §3). The
// provider token is an ES256 JWT (kid = key id, iss = team id, iat), reused for 50 minutes as
// Apple asks (refresh between 20 and 60 minutes). Priority lane: apns-priority 10 and the
// time-sensitive interruption level (needs the Time Sensitive Notifications capability on the
// App ID); normal lane: priority 5, active. A 410, or a 400 BadDeviceToken, means the token is
// dead. `fetchFn` is injectable for tests.

import { signJwt } from './jwt';
import type { PushMessage, PushPort, PushResult } from './PushPort';

export type ApnsConfig = { keyPem: string; keyId: string; teamId: string; topic: string };

export class ApnsPushPort implements PushPort {
  private cached: { token: string; at: number } | null = null;

  constructor(
    private readonly config: ApnsConfig,
    private readonly fetchFn: typeof fetch = (input, init) => fetch(input, init),
    private readonly nowSeconds: () => number = () => Math.floor(Date.now() / 1000),
  ) {}

  /** The provider token, signed again after 50 minutes. */
  async providerToken(): Promise<string> {
    const now = this.nowSeconds();
    if (this.cached && now - this.cached.at < 50 * 60) return this.cached.token;
    const token = await signJwt(
      'ES256',
      this.config.keyPem,
      { kid: this.config.keyId },
      { iss: this.config.teamId, iat: now },
    );
    this.cached = { token, at: now };
    return token;
  }

  async send(message: PushMessage): Promise<PushResult> {
    if (message.platform !== 'ios') return 'unconfigured';
    const host =
      message.apnsEnvironment === 'sandbox' ? 'api.sandbox.push.apple.com' : 'api.push.apple.com';
    const priority = message.lane === 'priority';
    const payload = {
      aps: {
        alert: { title: message.title, body: message.body },
        sound: 'default',
        'thread-id': message.data.tripId,
        'interruption-level': priority ? 'time-sensitive' : 'active',
      },
      ...message.data,
    };
    let res: Response;
    try {
      res = await this.fetchFn(`https://${host}/3/device/${message.token}`, {
        method: 'POST',
        headers: {
          authorization: `bearer ${await this.providerToken()}`,
          'apns-topic': this.config.topic,
          'apns-push-type': 'alert',
          'apns-priority': priority ? '10' : '5',
          'content-type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
    } catch {
      return 'failed';
    }
    if (res.status === 200) return 'sent';
    if (res.status === 410) return 'invalid-token';
    if (res.status === 400) {
      const reason = ((await res.json().catch(() => ({}))) as { reason?: string }).reason;
      if (reason === 'BadDeviceToken' || reason === 'DeviceTokenNotForTopic')
        return 'invalid-token';
    }
    return 'failed';
  }
}
