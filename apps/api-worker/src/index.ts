// Copyright 2026- At Day. All rights reserved.
// Worker entry. Exports the fetch handler. Durable Object classes and queue consumers are
// exported from here by later slices.

import { createApp } from './app';

const app = createApp();

export default {
  fetch: app.fetch,
} satisfies ExportedHandler<Env>;
