// Copyright 2026- At Day. All rights reserved.
//
// Photos (D18, slice 043). Upload: anyone on the trip but guardians, and organizers; the Worker
// checks the magic bytes, strips the metadata (EXIF, XMP, IPTC, text chunks), asks the AI port
// for a flag on the thumbnail (the fixture reads a marker), seals both renditions with the
// MEDIA_KEY and puts them in R2; the organization object keeps the metadata. Reads answer the
// sealed bytes unsealed, to whoever may see the photo (ADR-0009). Staff (owner, organizer,
// leader) clear a flag, put a photo in the guardian album with tags, take it out; the uploader
// or an organizer deletes, which shreds the objects. Rule of thumb: nothing a client sends about
// itself is trusted (type, size, who); everything is read from bytes and the session.

import { createRoute, type OpenAPIHono } from '@hono/zod-openapi';
import {
  AlbumPhotoRequest,
  DeletePhotoResponse,
  PHOTO_ORIGINAL_MAX_BYTES,
  PHOTO_THUMBNAIL_MAX_BYTES,
  Photo,
  type PhotoContentType,
  PhotoList,
  ReviewPhotoRequest,
  UploadPhotoForm,
} from '@voysemble/contracts';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { aiPort } from '../ai/AiPort';
import { organizerName, requireAuth, requireOrgRole } from '../auth/middleware';
import type { AppEnv, AuthContext } from '../env';
import { sniffImageType, stripMetadata } from '../lib/image-strip';
import { mediaKeyFrom, sealBytes, unsealBytes } from '../lib/media-crypto';
import { nowIso } from '../lib/time';
import { orgObject } from '../org/client';
import type { OrgDurableObject, PhotoViewer } from '../org/OrgDurableObject';
import { ERROR_RESPONSES, SESSION_SECURITY } from './openapi-common';
import { TripParams } from './trips';

const PhotoParams = TripParams.extend({ photoId: z.uuid() });

const BYTES_RESPONSE = {
  description: 'The image bytes, unsealed; private, cacheable by the browser for an hour.',
  content: {
    'image/jpeg': { schema: z.string().openapi({ type: 'string', format: 'binary' }) },
  },
};

const uploadRoute = createRoute({
  method: 'post',
  path: '/v1/orgs/{orgId}/trips/{tripId}/media',
  tags: ['media'],
  summary: 'Upload a photo to the trip pool (leaders, travelers, organizers)',
  description:
    'multipart/form-data: `original` (JPEG, PNG or WebP, at most 12 MiB), `thumbnail` (same type, at most 512 KiB; optional when the original is that small), `takenAt` (RFC 3339, optional). The type is read from the bytes; EXIF, XMP, IPTC and text chunks are stripped; the moderation model may flag the photo for a leader (D18); both renditions are sealed at rest. 503 when the deployment has no MEDIA_KEY.',
  security: SESSION_SECURITY,
  request: {
    params: TripParams,
    body: { content: { 'multipart/form-data': { schema: UploadPhotoForm } } },
  },
  responses: {
    201: { description: 'Stored.', content: { 'application/json': { schema: Photo } } },
    400: ERROR_RESPONSES[400],
    401: ERROR_RESPONSES[401],
    403: ERROR_RESPONSES[403],
    404: ERROR_RESPONSES[404],
    500: ERROR_RESPONSES[500],
  },
});

const listRoute = createRoute({
  method: 'get',
  path: '/v1/orgs/{orgId}/trips/{tripId}/media',
  tags: ['media'],
  summary: 'Photos the caller may see, newest first (ADR-0009)',
  description:
    'Staff and travelers: the pool (flagged photos only for staff and their uploader). Guardians: approved photos tagged with their traveler or the whole group.',
  security: SESSION_SECURITY,
  request: { params: TripParams },
  responses: {
    200: { description: 'Photos.', content: { 'application/json': { schema: PhotoList } } },
    401: ERROR_RESPONSES[401],
    403: ERROR_RESPONSES[403],
    404: ERROR_RESPONSES[404],
    500: ERROR_RESPONSES[500],
  },
});

const thumbnailRoute = createRoute({
  method: 'get',
  path: '/v1/orgs/{orgId}/trips/{tripId}/media/{photoId}/thumbnail',
  tags: ['media'],
  summary: 'The thumbnail bytes',
  security: SESSION_SECURITY,
  request: { params: PhotoParams },
  responses: {
    200: BYTES_RESPONSE,
    401: ERROR_RESPONSES[401],
    403: ERROR_RESPONSES[403],
    404: ERROR_RESPONSES[404],
    500: ERROR_RESPONSES[500],
  },
});

const contentRoute = createRoute({
  method: 'get',
  path: '/v1/orgs/{orgId}/trips/{tripId}/media/{photoId}/content',
  tags: ['media'],
  summary: 'The full image bytes',
  security: SESSION_SECURITY,
  request: { params: PhotoParams },
  responses: {
    200: BYTES_RESPONSE,
    401: ERROR_RESPONSES[401],
    403: ERROR_RESPONSES[403],
    404: ERROR_RESPONSES[404],
    500: ERROR_RESPONSES[500],
  },
});

const reviewRoute = createRoute({
  method: 'post',
  path: '/v1/orgs/{orgId}/trips/{tripId}/media/{photoId}/review',
  tags: ['media'],
  summary: 'Decide on a flagged photo: clear it into the pool, or remove it (staff)',
  security: SESSION_SECURITY,
  request: {
    params: PhotoParams,
    body: { content: { 'application/json': { schema: ReviewPhotoRequest } } },
  },
  responses: {
    200: {
      description: 'The photo after a clear; after a remove, the deletion.',
      content: { 'application/json': { schema: z.union([Photo, DeletePhotoResponse]) } },
    },
    400: ERROR_RESPONSES[400],
    401: ERROR_RESPONSES[401],
    403: ERROR_RESPONSES[403],
    404: ERROR_RESPONSES[404],
    409: ERROR_RESPONSES[409],
    500: ERROR_RESPONSES[500],
  },
});

const albumRoute = createRoute({
  method: 'put',
  path: '/v1/orgs/{orgId}/trips/{tripId}/media/{photoId}/album',
  tags: ['media'],
  summary: 'Put a photo in the guardian album with its tags (staff)',
  description:
    'Tags are travelers of the trip, or the whole group; at least one. A flagged photo must be cleared first (409). Replaces earlier tags.',
  security: SESSION_SECURITY,
  request: {
    params: PhotoParams,
    body: { content: { 'application/json': { schema: AlbumPhotoRequest } } },
  },
  responses: {
    200: { description: 'In the album.', content: { 'application/json': { schema: Photo } } },
    400: ERROR_RESPONSES[400],
    401: ERROR_RESPONSES[401],
    403: ERROR_RESPONSES[403],
    404: ERROR_RESPONSES[404],
    409: ERROR_RESPONSES[409],
    500: ERROR_RESPONSES[500],
  },
});

const unalbumRoute = createRoute({
  method: 'delete',
  path: '/v1/orgs/{orgId}/trips/{tripId}/media/{photoId}/album',
  tags: ['media'],
  summary: 'Take a photo out of the guardian album (staff)',
  security: SESSION_SECURITY,
  request: { params: PhotoParams },
  responses: {
    200: { description: 'Out of the album.', content: { 'application/json': { schema: Photo } } },
    401: ERROR_RESPONSES[401],
    403: ERROR_RESPONSES[403],
    404: ERROR_RESPONSES[404],
    500: ERROR_RESPONSES[500],
  },
});

const deleteRoute = createRoute({
  method: 'delete',
  path: '/v1/orgs/{orgId}/trips/{tripId}/media/{photoId}',
  tags: ['media'],
  summary: 'Delete a photo everywhere (its uploader, or an organizer); the objects are shredded',
  security: SESSION_SECURITY,
  request: { params: PhotoParams },
  responses: {
    200: {
      description: 'Deleted.',
      content: { 'application/json': { schema: DeletePhotoResponse } },
    },
    401: ERROR_RESPONSES[401],
    403: ERROR_RESPONSES[403],
    404: ERROR_RESPONSES[404],
    500: ERROR_RESPONSES[500],
  },
});

/** Who is calling, as the organization object understands it (see chat's viewer). */
async function viewerFor(
  env: AppEnv['Bindings'],
  auth: AuthContext,
  orgId: string,
  tripId: string,
): Promise<{ org: DurableObjectStub<OrgDurableObject>; viewer: PhotoViewer; organizer: boolean }> {
  const access = await requireOrgRole(env, auth, orgId, 'member');
  const org = await orgObject(env, orgId);
  if (!(await org.getTrip(tripId))) throw new HTTPException(404, { message: 'Trip not found.' });
  const me = await org.participationForAccount(tripId, auth.accountId);
  const organizer = access.role === 'owner' || access.role === 'organizer';
  if (!me && !organizer) throw new HTTPException(403, { message: 'Not on this trip.' });
  const viewer: PhotoViewer = me
    ? {
        key: me.id,
        name: me.displayName,
        role: me.role,
        guardianOf: me.guardianOf,
      }
    : {
        key: `acct:${auth.accountId}`,
        name: organizerName(auth, access),
        role: access.role === 'owner' ? 'owner' : 'organizer',
        guardianOf: null,
      };
  return { org, viewer, organizer };
}

const isStaff = (v: PhotoViewer) =>
  v.role === 'owner' || v.role === 'organizer' || v.role === 'leader';

/** R2 keys: one prefix per photo so a delete removes both renditions. */
const objectKey = (orgId: string, tripId: string, photoId: string, rendition: 'o' | 't') =>
  `media/${orgId}/${tripId}/${photoId}/${rendition}`;

/** The trip day (1 = starts_on) of an instant in the trip's zone; 0 outside the dates. */
export function tripDayOf(
  trip: { startsOn: string; endsOn: string; timezone: string },
  iso: string,
): number {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return 0;
  let local: string;
  try {
    local = new Intl.DateTimeFormat('en-CA', {
      timeZone: trip.timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(at);
  } catch {
    local = iso.slice(0, 10);
  }
  if (local < trip.startsOn || local > trip.endsOn) return 0;
  const days = Math.round((Date.parse(local) - Date.parse(trip.startsOn)) / 86_400_000);
  return days + 1;
}

async function mediaKey(env: AppEnv['Bindings']): Promise<CryptoKey> {
  const key = await mediaKeyFrom(env);
  if (!key) throw new HTTPException(503, { message: 'Photos are not configured here.' });
  return key;
}

function fileOf(v: unknown): File | null {
  return typeof File !== 'undefined' && v instanceof File ? v : null;
}

export function mountMediaRoutes(app: OpenAPIHono<AppEnv>): void {
  app.openapi(uploadRoute, async (c) => {
    const auth = requireAuth(c);
    const { orgId, tripId } = c.req.valid('param');
    const { org, viewer } = await viewerFor(c.env, auth, orgId, tripId);
    if (viewer.role === 'guardian') {
      throw new HTTPException(403, { message: 'Guardians see the album; they do not upload.' });
    }
    const form = c.req.valid('form');
    const original = fileOf(form.original);
    if (!original) throw new HTTPException(400, { message: 'An image file is required.' });
    if (original.size > PHOTO_ORIGINAL_MAX_BYTES) {
      throw new HTTPException(400, { message: 'The image is larger than 12 MiB.' });
    }
    const rawOriginal = new Uint8Array(await original.arrayBuffer());
    const type = sniffImageType(rawOriginal);
    if (!type) throw new HTTPException(400, { message: 'Only JPEG, PNG and WebP photos.' });
    const thumbFile = fileOf(form.thumbnail);
    let rawThumb: Uint8Array;
    if (thumbFile) {
      if (thumbFile.size > PHOTO_THUMBNAIL_MAX_BYTES) {
        throw new HTTPException(400, { message: 'The thumbnail is larger than 512 KiB.' });
      }
      rawThumb = new Uint8Array(await thumbFile.arrayBuffer());
      if (sniffImageType(rawThumb) !== type) {
        throw new HTTPException(400, { message: 'The thumbnail must be the same image type.' });
      }
    } else if (rawOriginal.length <= PHOTO_THUMBNAIL_MAX_BYTES) {
      rawThumb = rawOriginal;
    } else {
      throw new HTTPException(400, { message: 'A thumbnail is required for an image this large.' });
    }
    const takenAtRaw = typeof form.takenAt === 'string' ? form.takenAt.trim() : '';
    const now = nowIso();
    const takenAt =
      takenAtRaw && !Number.isNaN(Date.parse(takenAtRaw))
        ? new Date(takenAtRaw).toISOString()
        : now;
    const trip = await org.getTrip(tripId);
    if (!trip) throw new HTTPException(404, { message: 'Trip not found.' });
    const key = await mediaKey(c.env);
    // The model sees the bytes before the strip only in the fixture (its marker sits in metadata).
    const flag = await aiPort(c.env).moderateImage({
      thumbnail: rawThumb,
      original: rawOriginal,
      contentType: type,
    });
    const cleanOriginal = stripMetadata(rawOriginal, type);
    const cleanThumb = rawThumb === rawOriginal ? cleanOriginal : stripMetadata(rawThumb, type);
    const id = crypto.randomUUID();
    await c.env.MEDIA.put(objectKey(orgId, tripId, id, 'o'), await sealBytes(key, cleanOriginal), {
      customMetadata: { contentType: type },
    });
    await c.env.MEDIA.put(objectKey(orgId, tripId, id, 't'), await sealBytes(key, cleanThumb), {
      customMetadata: { contentType: type },
    });
    const r = await org.addPhoto({
      id,
      tripId,
      uploader: viewer,
      day: tripDayOf(trip, takenAt),
      takenAt,
      contentType: type as PhotoContentType,
      bytes: cleanOriginal.length,
      thumbnailBytes: cleanThumb.length,
      flag,
      now,
    });
    if ('notFound' in r) throw new HTTPException(404, { message: 'Trip not found.' });
    return c.json(r, 201);
  });

  app.openapi(listRoute, async (c) => {
    const auth = requireAuth(c);
    const { orgId, tripId } = c.req.valid('param');
    const { org, viewer } = await viewerFor(c.env, auth, orgId, tripId);
    const r = await org.listPhotos(tripId, viewer);
    if ('notFound' in r) throw new HTTPException(404, { message: 'Trip not found.' });
    return c.json(r, 200);
  });

  const serve = async (
    c: Parameters<Parameters<typeof app.openapi<typeof thumbnailRoute>>[1]>[0],
    rendition: 'o' | 't',
  ) => {
    const auth = requireAuth(c);
    const { orgId, tripId, photoId } = c.req.valid('param');
    const { org, viewer } = await viewerFor(c.env, auth, orgId, tripId);
    const photo = await org.getPhoto(tripId, photoId, viewer);
    if ('notFound' in photo) throw new HTTPException(404, { message: 'Photo not found.' });
    const key = await mediaKey(c.env);
    const object = await c.env.MEDIA.get(objectKey(orgId, tripId, photoId, rendition));
    if (!object) throw new HTTPException(404, { message: 'Photo not found.' });
    const bytes = await unsealBytes(key, new Uint8Array(await object.arrayBuffer()));
    return c.body(bytes as unknown as ArrayBuffer, 200, {
      'Content-Type': photo.contentType,
      'Content-Length': String(bytes.length),
      'Cache-Control': 'private, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    });
  };
  app.openapi(thumbnailRoute, (c) => serve(c, 't'));
  app.openapi(contentRoute, (c) => serve(c, 'o'));

  /** Both renditions; a missing object is fine (already gone). */
  const shred = async (env: AppEnv['Bindings'], orgId: string, tripId: string, photoId: string) => {
    await env.MEDIA.delete([
      objectKey(orgId, tripId, photoId, 'o'),
      objectKey(orgId, tripId, photoId, 't'),
    ]);
  };

  app.openapi(reviewRoute, async (c) => {
    const auth = requireAuth(c);
    const { orgId, tripId, photoId } = c.req.valid('param');
    const { decision } = c.req.valid('json');
    const { org, viewer } = await viewerFor(c.env, auth, orgId, tripId);
    if (!isStaff(viewer)) throw new HTTPException(403, { message: 'Leaders review photos.' });
    if (decision === 'remove') {
      const r = await org.deletePhoto(tripId, photoId);
      if ('notFound' in r) throw new HTTPException(404, { message: 'Photo not found.' });
      await shred(c.env, orgId, tripId, photoId);
      return c.json({ deleted: true as const, photoId }, 200);
    }
    const r = await org.clearPhotoFlag(tripId, photoId, viewer, nowIso());
    if ('notFound' in r) throw new HTTPException(404, { message: 'Photo not found.' });
    if ('notFlagged' in r) throw new HTTPException(409, { message: 'This photo is not flagged.' });
    return c.json(r, 200);
  });

  app.openapi(albumRoute, async (c) => {
    const auth = requireAuth(c);
    const { orgId, tripId, photoId } = c.req.valid('param');
    const tags = c.req.valid('json');
    if (!tags.wholeGroup && tags.participationIds.length === 0) {
      throw new HTTPException(400, { message: 'Tag at least one traveler or the whole group.' });
    }
    const { org, viewer } = await viewerFor(c.env, auth, orgId, tripId);
    if (!isStaff(viewer)) throw new HTTPException(403, { message: 'Leaders build the album.' });
    const r = await org.setPhotoAlbum(tripId, photoId, tags, viewer, nowIso());
    if ('notFound' in r) throw new HTTPException(404, { message: 'Photo not found.' });
    if ('flagged' in r) throw new HTTPException(409, { message: 'Clear the flag first.' });
    if ('badTag' in r)
      throw new HTTPException(400, { message: 'Tags must be travelers of this trip.' });
    return c.json(r, 200);
  });

  app.openapi(unalbumRoute, async (c) => {
    const auth = requireAuth(c);
    const { orgId, tripId, photoId } = c.req.valid('param');
    const { org, viewer } = await viewerFor(c.env, auth, orgId, tripId);
    if (!isStaff(viewer)) throw new HTTPException(403, { message: 'Leaders build the album.' });
    const r = await org.clearPhotoAlbum(tripId, photoId, viewer);
    if ('notFound' in r) throw new HTTPException(404, { message: 'Photo not found.' });
    return c.json(r, 200);
  });

  app.openapi(deleteRoute, async (c) => {
    const auth = requireAuth(c);
    const { orgId, tripId, photoId } = c.req.valid('param');
    const { org, viewer, organizer } = await viewerFor(c.env, auth, orgId, tripId);
    const uploaderKey = await org.photoUploaderKey(tripId, photoId);
    if (uploaderKey === null) throw new HTTPException(404, { message: 'Photo not found.' });
    if (uploaderKey !== viewer.key && !organizer) {
      throw new HTTPException(403, {
        message: 'Only the uploader or an organizer deletes a photo.',
      });
    }
    const r = await org.deletePhoto(tripId, photoId);
    if ('notFound' in r) throw new HTTPException(404, { message: 'Photo not found.' });
    await shred(c.env, orgId, tripId, photoId);
    return c.json({ deleted: true as const, photoId }, 200);
  });
}
