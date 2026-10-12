// Copyright 2026- At Day. All rights reserved.
// Worker entry. Exports the fetch handler, the Durable Object classes and, since slice 054, the
// cron handler that sends the guardian digest (D29), the packing reminders (D38) and the
// document reminders (D27, slice 062): the notification rows are the queue, the runs read what
// is due. Queue consumers arrive with later
// slices.

import { createApp } from './app';
import { runDigests } from './lib/digest';
import { runDocumentReminders } from './lib/document-reminders';
import { runPackingReminders } from './lib/packing-reminders';

export { RateLimitDurableObject } from './lib/RateLimitDurableObject';
export { OrgDurableObject } from './org/OrgDurableObject';

const app = createApp();

export default {
  fetch: app.fetch,
  scheduled(controller, env, ctx) {
    const now = new Date(controller.scheduledTime).toISOString();
    ctx.waitUntil(
      runDigests(env, now).then((run) =>
        console.log(
          JSON.stringify({ level: 'info', cron: controller.cron, at: now, run: 'digest', ...run }),
        ),
      ),
    );
    // Slice 056: the packing reminders on the mornings before the trip; idempotent per morning.
    ctx.waitUntil(
      runPackingReminders(env, now).then((run) =>
        console.log(
          JSON.stringify({ level: 'info', cron: controller.cron, at: now, run: 'packing', ...run }),
        ),
      ),
    );
    // Slice 062: the document reminders on the mornings before a due date; the same reference as
    // the organizer's nudge, so a person hears it once a day.
    ctx.waitUntil(
      runDocumentReminders(env, now).then((run) =>
        console.log(
          JSON.stringify({
            level: 'info',
            cron: controller.cron,
            at: now,
            run: 'documents',
            ...run,
          }),
        ),
      ),
    );
  },
} satisfies ExportedHandler<Env>;
