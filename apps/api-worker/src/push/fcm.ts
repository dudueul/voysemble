// Copyright 2026- At Day. All rights reserved.
//
// Firebase Cloud Messaging HTTP v1 with a service account (docs/runbooks/google.md §3). An OAuth
// access token comes from a signed RS256 assertion (scope firebase.messaging), reused until five
// minutes before it expires. Priority lane: Android priority HIGH on the `lane.priority` channel;
// normal lane: NORMAL on `lane.normal` (the channels the app creates at launch, slice 053). A 404
// or an UNREGISTERED error means the token is dead. `fetchFn` is injectable for tests.

import { signJwt } from './jwt';
import type { PushMessage, PushPort, PushResult } from './PushPort';

export type ServiceAccount = {
  project_id: string;
  client_email: string;
  private_key: string;
  token_uri?: string;
};

const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
const TOKEN_URI = 'https://oauth2.googleapis.com/token';

export class FcmPushPort implements PushPort {
  private cached: { token: string; expiresAt: number } | null = null;

  constructor(
    private readonly account: ServiceAccount,
    private readonly fetchFn: typeof fetch = (input, init) => fetch(input, init),
    private readonly nowSeconds: () => number = () => Math.floor(Date.now() / 1000),
  ) {}

  async accessToken(): Promise<string> {
    const now = this.nowSeconds();
    if (this.cached && now < this.cached.expiresAt - 300) return this.cached.token;
    const aud = this.account.token_uri ?? TOKEN_URI;
    const assertion = await signJwt(
      'RS256',
      this.account.private_key,
      { typ: 'JWT' },
      { iss: this.account.client_email, scope: SCOPE, aud, iat: now, exp: now + 3600 },
    );
    const res = await this.fetchFn(aud, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${assertion}`,
    });
    if (!res.ok) throw new Error(`FCM token exchange failed: ${res.status}`);
    const body = (await res.json()) as { access_token: string; expires_in: number };
    this.cached = { token: body.access_token, expiresAt: now + body.expires_in };
    return body.access_token;
  }

  async send(message: PushMessage): Promise<PushResult> {
    if (message.platform !== 'android') return 'unconfigured';
    const priority = message.lane === 'priority';
    let res: Response;
    try {
      res = await this.fetchFn(
        `https://fcm.googleapis.com/v1/projects/${this.account.project_id}/messages:send`,
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${await this.accessToken()}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            message: {
              token: message.token,
              notification: { title: message.title, body: message.body },
              android: {
                priority: priority ? 'HIGH' : 'NORMAL',
                notification: { channel_id: priority ? 'lane.priority' : 'lane.normal' },
              },
              data: message.data,
            },
          }),
        },
      );
    } catch {
      return 'failed';
    }
    if (res.status === 200) return 'sent';
    if (res.status === 404) return 'invalid-token';
    const err = (await res.json().catch(() => ({}))) as {
      error?: { details?: { errorCode?: string }[] };
    };
    if (err.error?.details?.some((d) => d.errorCode === 'UNREGISTERED')) return 'invalid-token';
    return 'failed';
  }
}
