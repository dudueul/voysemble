// Copyright 2026- At Day. All rights reserved.
//
// Documents and forms (D27, D36, slice 045). Owner and organizer only, on the console: the
// requirements of a trip (passport copy, consent, insurance), one row per traveler with a state
// (missing, collected, waived) and, when the organizer keeps one, a sealed scan (PDF, JPEG or
// PNG; images lose their metadata; AES-GCM under MEDIA_KEY in R2, tier 3). Revealing a scan needs
// a confirmation younger than ten minutes (D35, code REAUTH_REQUIRED otherwise), answers with
// `Cache-Control: no-store`, and lands as a fact on the traveler's timeline. Never on a phone.

import { createRoute, type OpenAPIHono } from '@hono/zod-openapi';
import {
  CreateDocumentRequirementRequest,
  DOCUMENT_MAX_BYTES,
  DocumentItem,
  DocumentItemList,
  DocumentRequirement,
  DocumentRequirementList,
  type DocumentScanType,
  SetDocumentStateRequest,
  UpdateDocumentRequirementRequest,
  UploadDocumentForm,
} from '@voysemble/contracts';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { requireAuth, requireOrgRole, requireRecentReauth } from '../auth/middleware';
import type { AppEnv, AuthContext } from '../env';
import { sniffImageType, stripMetadata } from '../lib/image-strip';
import { mediaKeyFrom, sealBytes, unsealBytes } from '../lib/media-crypto';
import { nowIso } from '../lib/time';
import { orgObject } from '../org/client';
import type { OrgDurableObject } from '../org/OrgDurableObject';
import { ERROR_RESPONSES, SESSION_SECURITY } from './openapi-common';
import { TripParams } from './trips';

const ReqParams = TripParams.extend({ requirementId: z.uuid() });
const ItemParams = ReqParams.extend({ participationId: z.uuid() });

const listRoute = createRoute({
  method: 'get',
  path: '/v1/orgs/{orgId}/trips/{tripId}/documents',
  tags: ['documents'],
  summary: 'The requirements of a trip with their counts (owner, organizer)',
  security: SESSION_SECURITY,
  request: { params: TripParams },
  responses: {
    200: {
      description: 'Requirements in creation order; a traveler without a row counts as missing.',
      content: { 'application/json': { schema: DocumentRequirementList } },
    },
    401: ERROR_RESPONSES[401],
    403: ERROR_RESPONSES[403],
    404: ERROR_RESPONSES[404],
    500: ERROR_RESPONSES[500],
  },
});

const createRoute_ = createRoute({
  method: 'post',
  path: '/v1/orgs/{orgId}/trips/{tripId}/documents',
  tags: ['documents'],
  summary: 'Add a requirement (owner, organizer)',
  security: SESSION_SECURITY,
  request: {
    params: TripParams,
    body: { content: { 'application/json': { schema: CreateDocumentRequirementRequest } } },
  },
  responses: {
    201: {
      description: 'Created, with zero counts.',
      content: { 'application/json': { schema: DocumentRequirement } },
    },
    400: ERROR_RESPONSES[400],
    401: ERROR_RESPONSES[401],
    403: ERROR_RESPONSES[403],
    404: ERROR_RESPONSES[404],
    500: ERROR_RESPONSES[500],
  },
});

const updateRoute = createRoute({
  method: 'patch',
  path: '/v1/orgs/{orgId}/trips/{tripId}/documents/{requirementId}',
  tags: ['documents'],
  summary: 'Rename a requirement, change whether it is required or its due date',
  security: SESSION_SECURITY,
  request: {
    params: ReqParams,
    body: { content: { 'application/json': { schema: UpdateDocumentRequirementRequest } } },
  },
  responses: {
    200: {
      description: 'Updated.',
      content: { 'application/json': { schema: DocumentRequirement } },
    },
    400: ERROR_RESPONSES[400],
    401: ERROR_RESPONSES[401],
    403: ERROR_RESPONSES[403],
    404: ERROR_RESPONSES[404],
    500: ERROR_RESPONSES[500],
  },
});

const deleteRoute = createRoute({
  method: 'delete',
  path: '/v1/orgs/{orgId}/trips/{tripId}/documents/{requirementId}',
  tags: ['documents'],
  summary: 'Remove a requirement, its rows and its scans (shredded)',
  security: SESSION_SECURITY,
  request: { params: ReqParams },
  responses: {
    200: {
      description: 'Removed.',
      content: {
        'application/json': {
          schema: z.object({ deleted: z.literal(true), requirementId: z.uuid() }),
        },
      },
    },
    401: ERROR_RESPONSES[401],
    403: ERROR_RESPONSES[403],
    404: ERROR_RESPONSES[404],
    500: ERROR_RESPONSES[500],
  },
});

const itemsRoute = createRoute({
  method: 'get',
  path: '/v1/orgs/{orgId}/trips/{tripId}/documents/{requirementId}/items',
  tags: ['documents'],
  summary: 'Every traveler under a requirement with their state and scan facts',
  security: SESSION_SECURITY,
  request: { params: ReqParams },
  responses: {
    200: {
      description: 'Rows, group then name.',
      content: { 'application/json': { schema: DocumentItemList } },
    },
    401: ERROR_RESPONSES[401],
    403: ERROR_RESPONSES[403],
    404: ERROR_RESPONSES[404],
    500: ERROR_RESPONSES[500],
  },
});

const setStateRoute = createRoute({
  method: 'put',
  path: '/v1/orgs/{orgId}/trips/{tripId}/documents/{requirementId}/items/{participationId}',
  tags: ['documents'],
  summary: "Set a traveler's state for a requirement: missing, collected or waived",
  security: SESSION_SECURITY,
  request: {
    params: ItemParams,
    body: { content: { 'application/json': { schema: SetDocumentStateRequest } } },
  },
  responses: {
    200: { description: 'The row.', content: { 'application/json': { schema: DocumentItem } } },
    400: ERROR_RESPONSES[400],
    401: ERROR_RESPONSES[401],
    403: ERROR_RESPONSES[403],
    404: ERROR_RESPONSES[404],
    500: ERROR_RESPONSES[500],
  },
});

const uploadScanRoute = createRoute({
  method: 'post',
  path: '/v1/orgs/{orgId}/trips/{tripId}/documents/{requirementId}/items/{participationId}/scan',
  tags: ['documents'],
  summary:
    'Keep a sealed scan for a traveler (PDF, JPEG or PNG, at most 12 MiB); marks the row collected',
  description:
    'multipart/form-data with `file`. The type comes from the bytes; images lose EXIF, XMP, IPTC and text chunks; the object is sealed at rest. 503 when the deployment has no MEDIA_KEY. Replaces an earlier scan.',
  security: SESSION_SECURITY,
  request: {
    params: ItemParams,
    body: { content: { 'multipart/form-data': { schema: UploadDocumentForm } } },
  },
  responses: {
    201: { description: 'Stored.', content: { 'application/json': { schema: DocumentItem } } },
    400: ERROR_RESPONSES[400],
    401: ERROR_RESPONSES[401],
    403: ERROR_RESPONSES[403],
    404: ERROR_RESPONSES[404],
    500: ERROR_RESPONSES[500],
  },
});

const revealScanRoute = createRoute({
  method: 'post',
  path: '/v1/orgs/{orgId}/trips/{tripId}/documents/{requirementId}/items/{participationId}/scan/reveal',
  tags: ['documents'],
  summary: 'The scan bytes (audited; needs a confirmation younger than ten minutes, D35)',
  description:
    "A POST because it is an action with a record: browsers replay an idempotent GET on a stale connection, which would double the audit line. 403 REAUTH_REQUIRED without a fresh confirmation (POST /v1/auth/reauth, then the emailed link). Answers `Cache-Control: no-store`; every reveal is a `document_reveal` fact on the traveler's timeline.",
  security: SESSION_SECURITY,
  request: { params: ItemParams },
  responses: {
    200: {
      description: 'The bytes, unsealed.',
      content: {
        'application/pdf': { schema: z.string().openapi({ type: 'string', format: 'binary' }) },
      },
    },
    401: ERROR_RESPONSES[401],
    403: ERROR_RESPONSES[403],
    404: ERROR_RESPONSES[404],
    500: ERROR_RESPONSES[500],
  },
});

const deleteScanRoute = createRoute({
  method: 'delete',
  path: '/v1/orgs/{orgId}/trips/{tripId}/documents/{requirementId}/items/{participationId}/scan',
  tags: ['documents'],
  summary: "Shred a traveler's scan; the row's state stays",
  security: SESSION_SECURITY,
  request: { params: ItemParams },
  responses: {
    200: {
      description: 'The row without a scan.',
      content: { 'application/json': { schema: DocumentItem } },
    },
    401: ERROR_RESPONSES[401],
    403: ERROR_RESPONSES[403],
    404: ERROR_RESPONSES[404],
    500: ERROR_RESPONSES[500],
  },
});

/** Owner or organizer, on a trip that exists; the name the audit lines carry. */
async function organizerFor(
  env: AppEnv['Bindings'],
  auth: AuthContext,
  orgId: string,
  tripId: string,
): Promise<{ org: DurableObjectStub<OrgDurableObject>; byName: string }> {
  const access = await requireOrgRole(env, auth, orgId, 'organizer');
  const org = await orgObject(env, orgId);
  if (!(await org.getTrip(tripId))) throw new HTTPException(404, { message: 'Trip not found.' });
  return { org, byName: access.role === 'owner' ? 'Owner' : 'Organizer' };
}

const objectKey = (orgId: string, tripId: string, requirementId: string, participationId: string) =>
  `documents/${orgId}/${tripId}/${requirementId}/${participationId}`;

/** PDF from its header, JPEG and PNG from theirs; WebP and the rest are not document scans. */
export function sniffDocumentType(bytes: Uint8Array): DocumentScanType | null {
  if (
    bytes.length >= 5 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46 &&
    bytes[4] === 0x2d
  ) {
    return 'application/pdf';
  }
  const image = sniffImageType(bytes);
  return image === 'image/jpeg' || image === 'image/png' ? image : null;
}

async function mediaKey(env: AppEnv['Bindings']): Promise<CryptoKey> {
  const key = await mediaKeyFrom(env);
  if (!key) throw new HTTPException(503, { message: 'Document scans are not configured here.' });
  return key;
}

const notFound = () => new HTTPException(404, { message: 'Requirement or traveler not found.' });

export function mountDocumentRoutes(app: OpenAPIHono<AppEnv>): void {
  app.openapi(listRoute, async (c) => {
    const auth = requireAuth(c);
    const { orgId, tripId } = c.req.valid('param');
    const { org } = await organizerFor(c.env, auth, orgId, tripId);
    const r = await org.listDocumentRequirements(tripId);
    if ('notFound' in r) throw new HTTPException(404, { message: 'Trip not found.' });
    return c.json(r, 200);
  });

  app.openapi(createRoute_, async (c) => {
    const auth = requireAuth(c);
    const { orgId, tripId } = c.req.valid('param');
    const body = c.req.valid('json');
    const { org } = await organizerFor(c.env, auth, orgId, tripId);
    const r = await org.createDocumentRequirement(tripId, body, nowIso());
    if ('notFound' in r) throw new HTTPException(404, { message: 'Trip not found.' });
    return c.json(r, 201);
  });

  app.openapi(updateRoute, async (c) => {
    const auth = requireAuth(c);
    const { orgId, tripId, requirementId } = c.req.valid('param');
    const body = c.req.valid('json');
    const { org } = await organizerFor(c.env, auth, orgId, tripId);
    const r = await org.updateDocumentRequirement(tripId, requirementId, body);
    if ('notFound' in r) throw notFound();
    return c.json(r, 200);
  });

  app.openapi(deleteRoute, async (c) => {
    const auth = requireAuth(c);
    const { orgId, tripId, requirementId } = c.req.valid('param');
    const { org } = await organizerFor(c.env, auth, orgId, tripId);
    const r = await org.deleteDocumentRequirement(tripId, requirementId);
    if ('notFound' in r) throw notFound();
    if (r.scans.length > 0) {
      await c.env.MEDIA.delete(r.scans.map((pid) => objectKey(orgId, tripId, requirementId, pid)));
    }
    return c.json({ deleted: true as const, requirementId }, 200);
  });

  app.openapi(itemsRoute, async (c) => {
    const auth = requireAuth(c);
    const { orgId, tripId, requirementId } = c.req.valid('param');
    const { org } = await organizerFor(c.env, auth, orgId, tripId);
    const r = await org.documentItems(tripId, requirementId);
    if ('notFound' in r) throw notFound();
    return c.json(r, 200);
  });

  app.openapi(setStateRoute, async (c) => {
    const auth = requireAuth(c);
    const { orgId, tripId, requirementId, participationId } = c.req.valid('param');
    const { state } = c.req.valid('json');
    const { org, byName } = await organizerFor(c.env, auth, orgId, tripId);
    const r = await org.setDocumentState(
      tripId,
      requirementId,
      participationId,
      state,
      byName,
      nowIso(),
    );
    if ('notFound' in r) throw notFound();
    return c.json(r, 200);
  });

  app.openapi(uploadScanRoute, async (c) => {
    const auth = requireAuth(c);
    const { orgId, tripId, requirementId, participationId } = c.req.valid('param');
    const { org, byName } = await organizerFor(c.env, auth, orgId, tripId);
    const form = c.req.valid('form');
    const file = typeof File !== 'undefined' && form.file instanceof File ? form.file : null;
    if (!file) throw new HTTPException(400, { message: 'A file is required.' });
    if (file.size > DOCUMENT_MAX_BYTES) {
      throw new HTTPException(400, { message: 'The scan is larger than 12 MiB.' });
    }
    const raw = new Uint8Array(await file.arrayBuffer());
    const type = sniffDocumentType(raw);
    if (!type) throw new HTTPException(400, { message: 'Only PDF, JPEG and PNG scans.' });
    const clean = type === 'application/pdf' ? raw : stripMetadata(raw, type);
    // The row first: an unknown traveler or requirement never reaches storage.
    const key = await mediaKey(c.env);
    const now = nowIso();
    const r = await org.setDocumentScan(
      tripId,
      requirementId,
      participationId,
      { contentType: type, bytes: clean.length },
      byName,
      now,
    );
    if ('notFound' in r) throw notFound();
    await c.env.MEDIA.put(
      objectKey(orgId, tripId, requirementId, participationId),
      await sealBytes(key, clean),
      { customMetadata: { contentType: type } },
    );
    return c.json(r, 201);
  });

  app.openapi(revealScanRoute, async (c) => {
    const auth = requireAuth(c);
    const { orgId, tripId, requirementId, participationId } = c.req.valid('param');
    const { org, byName } = await organizerFor(c.env, auth, orgId, tripId);
    requireRecentReauth(auth);
    const scan = await org.documentScan(tripId, requirementId, participationId);
    if (!scan) throw new HTTPException(404, { message: 'No scan on file.' });
    const key = await mediaKey(c.env);
    const object = await c.env.MEDIA.get(objectKey(orgId, tripId, requirementId, participationId));
    if (!object) throw new HTTPException(404, { message: 'No scan on file.' });
    const bytes = await unsealBytes(key, new Uint8Array(await object.arrayBuffer()));
    await org.recordDocumentReveal(tripId, requirementId, participationId, byName, nowIso());
    return c.body(bytes as unknown as ArrayBuffer, 200, {
      'Content-Type': scan.contentType,
      'Content-Length': String(bytes.length),
      'Content-Disposition': 'inline',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
  });

  app.openapi(deleteScanRoute, async (c) => {
    const auth = requireAuth(c);
    const { orgId, tripId, requirementId, participationId } = c.req.valid('param');
    const { org } = await organizerFor(c.env, auth, orgId, tripId);
    const r = await org.clearDocumentScan(tripId, requirementId, participationId);
    if ('notFound' in r) throw notFound();
    if ('noScan' in r) throw new HTTPException(404, { message: 'No scan on file.' });
    await c.env.MEDIA.delete(objectKey(orgId, tripId, requirementId, participationId));
    return c.json(r, 200);
  });
}
