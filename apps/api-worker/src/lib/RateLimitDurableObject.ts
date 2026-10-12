// Copyright 2026- At Day. All rights reserved.
//
// A counter per subject (an email, an address, an account) for the endpoints anyone can call
// (slice 041): one Durable Object per `scope:subject`, a fixed window inside it. Nothing here
// knows what the subject is; the routes decide the limits (lib/rate-limit.ts). The clock is a
// parameter so the test can walk a window to its end.

import { DurableObject } from 'cloudflare:workers';

type Window = { start: number; count: number };

export type HitResult = {
  allowed: boolean;
  /** Hits left in the window after this one (0 when refused). */
  remaining: number;
  /** Seconds until the window opens again; 0 when allowed. */
  retryAfterSeconds: number;
};

export class RateLimitDurableObject extends DurableObject<Env> {
  /**
   * Count one hit in the window of `windowSeconds`; refuse the hit beyond `limit`. A refused hit
   * is not counted, so a caller who keeps trying waits for the same window, not a growing one.
   */
  async hit(limit: number, windowSeconds: number, nowMs?: number): Promise<HitResult> {
    const now = nowMs ?? Date.now();
    const windowMs = windowSeconds * 1000;
    const stored = await this.ctx.storage.get<Window>('window');
    let start = stored?.start ?? now;
    let count = stored?.count ?? 0;
    if (now - start >= windowMs) {
      start = now;
      count = 0;
    }
    if (count >= limit) {
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: Math.max(1, Math.ceil((start + windowMs - now) / 1000)),
      };
    }
    count += 1;
    await this.ctx.storage.put<Window>('window', { start, count });
    return { allowed: true, remaining: limit - count, retryAfterSeconds: 0 };
  }

  /** Forget the window. The test helpers use it between sign-ins of the same address. */
  async reset(): Promise<void> {
    await this.ctx.storage.delete('window');
  }
}
