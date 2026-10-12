// Copyright 2026- At Day. All rights reserved.
//
// EmailPort (ADR-0007 "Email delivery"). The Worker composes messages; a port delivers them.
// Implementations: FixtureEmailPort (local/tests: writes to the DEV_MAILBOX KV so tests can read
// the magic link), CloudflareEmailPort (production transport, added when the Email Service
// binding is provisioned), UnavailableEmailPort (refuses loudly instead of logging secrets).
// Rule: a message body may contain a one-time token; it must never be logged.

export type OutboundEmail = {
  to: string;
  subject: string;
  text: string;
  locale: 'ko' | 'en';
  /** Lets tests find a message without scanning bodies. Never contains the token. */
  tag: 'magic-link' | 'invite' | 'digest' | 'incident';
};

export interface EmailPort {
  send(message: OutboundEmail): Promise<void>;
}

export class UnavailableEmailPort implements EmailPort {
  async send(): Promise<void> {
    throw new Error('email transport not configured for this environment');
  }
}

/** Stores messages under `mail:<to>:<timestamp>` for 1 hour. Local and test use only. */
export class FixtureEmailPort implements EmailPort {
  constructor(private readonly mailbox: KVNamespace) {}

  async send(message: OutboundEmail): Promise<void> {
    const key = `mail:${message.to}:${Date.now()}:${crypto.randomUUID().slice(0, 8)}`;
    await this.mailbox.put(key, JSON.stringify(message), { expirationTtl: 3600 });
  }

  /** Test helper: newest message for an address, or null. */
  static async latest(mailbox: KVNamespace, to: string): Promise<OutboundEmail | null> {
    const list = await mailbox.list({ prefix: `mail:${to}:` });
    const last = list.keys
      .map((k) => k.name)
      .sort()
      .at(-1);
    if (!last) return null;
    const raw = await mailbox.get(last);
    return raw ? (JSON.parse(raw) as OutboundEmail) : null;
  }
}

export function createEmailPort(env: Env): EmailPort {
  if (env.DEV_MAILBOX) return new FixtureEmailPort(env.DEV_MAILBOX);
  return new UnavailableEmailPort();
}
