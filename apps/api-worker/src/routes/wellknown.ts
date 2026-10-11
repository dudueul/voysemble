// Copyright 2026- At Day. All rights reserved.
//
// Domain association files for App Links (Android) and Universal Links (iOS), slice 019. The
// magic link in the sign-in email points at this origin's `/auth/verify#token=…`; with these
// files published, a phone with the app installed opens the link in the app instead of the
// browser, and the app verifies the token itself (no pasting). Values come from vars so each
// environment publishes its own certificate fingerprints and team id; unset vars publish an
// honest empty association (the browser flow keeps working).

import type { OpenAPIHono } from '@hono/zod-openapi';
import type { AppEnv } from '../env';

export const ANDROID_PACKAGE = 'com.voysemble.app';
export const IOS_BUNDLE_ID = 'com.voysemble.app';
export const MAGIC_LINK_PATH = '/auth/verify';

/** Digital Asset Links statement list; one entry per signing certificate fingerprint. */
export function assetLinks(input: {
  packageName?: string | undefined;
  certSha256?: string | undefined;
}): unknown[] {
  const fingerprints = (input.certSha256 ?? '')
    .split(',')
    .map((f) => f.trim().toUpperCase())
    .filter((f) => /^[0-9A-F]{2}(:[0-9A-F]{2}){31}$/.test(f));
  if (fingerprints.length === 0) return [];
  return [
    {
      relation: ['delegate_permission/common.handle_all_urls'],
      target: {
        namespace: 'android_app',
        package_name: input.packageName ?? ANDROID_PACKAGE,
        sha256_cert_fingerprints: fingerprints,
      },
    },
  ];
}

/** Apple App Site Association; `appIds` are `TEAMID.bundle`, comma-separated in the var. */
export function appleAppSiteAssociation(input: { appIds?: string | undefined }): {
  applinks: { details: { appIDs: string[]; components: { '/': string }[] }[] };
} {
  const appIds = (input.appIds ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => /^[A-Z0-9]{10}\.[A-Za-z0-9.-]+$/.test(s));
  return {
    applinks: {
      details:
        appIds.length === 0
          ? []
          : [{ appIDs: appIds, components: [{ '/': `${MAGIC_LINK_PATH}*` }] }],
    },
  };
}

export function mountWellKnownRoutes(app: OpenAPIHono<AppEnv>): void {
  app.get('/.well-known/assetlinks.json', (c) =>
    c.json(
      assetLinks({
        packageName: c.env.ANDROID_PACKAGE ?? ANDROID_PACKAGE,
        certSha256: c.env.ANDROID_CERT_SHA256,
      }),
      200,
      { 'cache-control': 'public, max-age=3600' },
    ),
  );
  // Apple fetches this without an extension and expects application/json.
  app.get('/.well-known/apple-app-site-association', (c) =>
    c.json(appleAppSiteAssociation({ appIds: c.env.APPLE_APP_IDS }), 200, {
      'cache-control': 'public, max-age=3600',
    }),
  );
}
