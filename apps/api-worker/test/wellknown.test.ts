// Copyright 2026- At Day. All rights reserved.
// Facts: assetlinks lists one statement per valid fingerprint and nothing for junk or unset;
// the Apple association claims /auth/verify* for each TEAMID.bundle and nothing when unset; both
// routes answer JSON (the Apple one with no extension) with a cache header; locally both are
// honest empties because the vars are unset.

import { describe, expect, it } from 'vitest';
import { appleAppSiteAssociation, assetLinks } from '../src/routes/wellknown';
import { api } from './helpers';

const FP =
  'AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99';

describe('well-known associations', () => {
  it('builders validate their inputs', () => {
    expect(assetLinks({})).toEqual([]);
    expect(assetLinks({ certSha256: 'not-a-fingerprint' })).toEqual([]);
    const one = assetLinks({ certSha256: `${FP.toLowerCase()}, bad` });
    expect(one).toHaveLength(1);
    expect(one[0]).toMatchObject({
      relation: ['delegate_permission/common.handle_all_urls'],
      target: {
        namespace: 'android_app',
        package_name: 'com.voysemble.app',
        sha256_cert_fingerprints: [FP],
      },
    });
    expect(appleAppSiteAssociation({}).applinks.details).toEqual([]);
    expect(appleAppSiteAssociation({ appIds: 'ABCDE12345.com.voysemble.app, junk' })).toEqual({
      applinks: {
        details: [
          { appIDs: ['ABCDE12345.com.voysemble.app'], components: [{ '/': '/auth/verify*' }] },
        ],
      },
    });
  });

  it('routes answer JSON with a cache header; empty locally', async () => {
    const android = await api(null).get('/.well-known/assetlinks.json');
    expect(android.status).toBe(200);
    expect(android.headers.get('content-type')).toContain('application/json');
    expect(android.headers.get('cache-control')).toContain('max-age=3600');
    expect(await android.json()).toEqual([]);
    const apple = await api(null).get('/.well-known/apple-app-site-association');
    expect(apple.status).toBe(200);
    expect(apple.headers.get('content-type')).toContain('application/json');
    expect(await apple.json()).toEqual({ applinks: { details: [] } });
  });
});
