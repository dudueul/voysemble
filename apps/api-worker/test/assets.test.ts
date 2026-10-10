// Copyright 2026- At Day. All rights reserved.
// Facts: the console shell is served asset-first with SPA fallback; API paths still hit the Worker.

import { SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

describe('static assets', () => {
  it('serves index.html at / and for client routes', async () => {
    for (const path of ['/', '/billing']) {
      const res = await SELF.fetch(`https://example.com${path}`);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/html');
      expect(await res.text()).toContain('<div id="root">');
    }
  });

  it('keeps /v1/* on the Worker (JSON 404, not SPA fallback)', async () => {
    const res = await SELF.fetch('https://example.com/v1/not-a-route');
    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toContain('application/json');
  });
});
