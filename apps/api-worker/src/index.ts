// Copyright 2026- At Day. All rights reserved.
// Worker entry. Exports the fetch handler, the Durable Object classes and, since slice 054, the
// cron handler that sends the guardian digest (D29): the digest-lane rows are the queue, the
// run reads what is due and mails it. Queue consumers arrive with later slices.

import { createApp } from './app';
import { runDigests } from './lib/digest';

export { RateLimitDurableObject } from './lib/RateLimitDurableObject';
export { OrgDurableObject } from './org/OrgDurableObject';

const app = createApp();

export default {
  fetch: app.fetch,
  scheduled(controller, env, ctx) {
    const now = new Date(controller.scheduledTime).toISOString();
    ctx.waitUntil(
      runDigests(env, now).then((run) =>
        console.log(JSON.stringify({ level: 'info', cron: controller.cron, at: now, ...run })),
      ),
    );
  },
} satisfies ExportedHandler<Env>;
