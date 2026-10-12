// Copyright 2026- At Day. All rights reserved.
//
// Photos (D18, slice 043). Uploads go to the trip pool; the moderation model only flags, a
// leader decides; a leader approves a photo for the guardian album and tags the travelers in it
// (or the whole group); guardians see approved photos tagged with their traveler or the group
// (ADR-0009); the uploader deletes their own photo, organizers any. Bytes travel as multipart
// (the device makes the thumbnail: Workers have no image codec, D34) and come back from the
// thumbnail and content routes; this file describes the metadata.

import { z } from '@hono/zod-openapi';
import { Id, Timestamp } from './common';

export const PhotoContentType = z
  .enum(['image/jpeg', 'image/png', 'image/webp'])
  .openapi('PhotoContentType');
export type PhotoContentType = z.infer<typeof PhotoContentType>;

/** What the moderation model may say about a thumbnail; the leader decides (D18). */
export const PhotoFlag = z.enum(['nudity', 'non_member_minor', 'violence']).openapi('PhotoFlag');
export type PhotoFlag = z.infer<typeof PhotoFlag>;

/**
 * `flagged`: hidden from the pool until a leader clears or removes it. `pool`: in the trip pool.
 * `approved`: in the pool and in the guardian album with its tags.
 */
export const PhotoStatus = z.enum(['pool', 'flagged', 'approved']).openapi('PhotoStatus');
export type PhotoStatus = z.infer<typeof PhotoStatus>;

export const PhotoUploaderRole = z
  .enum(['owner', 'organizer', 'leader', 'traveler'])
  .openapi('PhotoUploaderRole');
export type PhotoUploaderRole = z.infer<typeof PhotoUploaderRole>;

/** Album membership: who the leader tagged, resolved to names for display. */
export const PhotoAlbum = z
  .object({
    at: Timestamp,
    byName: z.string(),
    wholeGroup: z.boolean(),
    participationIds: z.array(Id),
    taggedNames: z.array(z.string()),
  })
  .openapi('PhotoAlbum');
export type PhotoAlbum = z.infer<typeof PhotoAlbum>;

export const Photo = z
  .object({
    id: Id,
    tripId: Id,
    uploaderName: z.string(),
    uploaderRole: PhotoUploaderRole,
    /** True on the caller's own uploads (they may delete them). */
    mine: z.boolean(),
    /** Trip day (1 = the first day) of `takenAt` in the trip's zone; 0 outside the trip dates. */
    day: z.number().int(),
    takenAt: Timestamp,
    contentType: PhotoContentType,
    bytes: z.number().int(),
    thumbnailBytes: z.number().int(),
    status: PhotoStatus,
    /** The moderation flag, kept after a leader cleared it (then `status` is no longer flagged). */
    flag: PhotoFlag.nullable(),
    reviewedByName: z.string().nullable(),
    album: PhotoAlbum.nullable(),
    uploadedAt: Timestamp,
    /** API paths (same origin as the console) that answer the bytes to anyone who may see the photo. */
    thumbnailUrl: z.string(),
    contentUrl: z.string(),
  })
  .openapi('Photo');
export type Photo = z.infer<typeof Photo>;

export const PhotoList = z
  .object({
    /** Newest first; only what the caller may see (ADR-0009). */
    photos: z.array(Photo),
    counts: z.object({
      pool: z.number().int(),
      flagged: z.number().int(),
      approved: z.number().int(),
    }),
  })
  .openapi('PhotoList');
export type PhotoList = z.infer<typeof PhotoList>;

/**
 * `POST .../media` as multipart/form-data: `original` (JPEG, PNG or WebP, at most 12 MiB),
 * `thumbnail` (same type, at most 512 KiB; may be omitted when the original is that small),
 * `takenAt` (RFC 3339; the upload time when absent).
 */
export const UploadPhotoForm = z
  .object({
    original: z.any().openapi({ type: 'string', format: 'binary' }),
    thumbnail: z.any().optional().openapi({ type: 'string', format: 'binary' }),
    takenAt: z.string().optional(),
  })
  .openapi('UploadPhotoForm');

/** A leader's decision on a flagged photo: back into the pool, or gone. */
export const ReviewPhotoRequest = z
  .object({ decision: z.enum(['clear', 'remove']) })
  .openapi('ReviewPhotoRequest');
export type ReviewPhotoRequest = z.infer<typeof ReviewPhotoRequest>;

/** Put a photo in the guardian album with its tags; at least one tag or the whole group. */
export const AlbumPhotoRequest = z
  .object({
    wholeGroup: z.boolean().default(false),
    participationIds: z.array(Id).max(100).default([]),
  })
  .openapi('AlbumPhotoRequest');
export type AlbumPhotoRequest = z.infer<typeof AlbumPhotoRequest>;

export const DeletePhotoResponse = z
  .object({ deleted: z.literal(true), photoId: Id })
  .openapi('DeletePhotoResponse');
export type DeletePhotoResponse = z.infer<typeof DeletePhotoResponse>;

export const PHOTO_ORIGINAL_MAX_BYTES = 12 * 1024 * 1024;
export const PHOTO_THUMBNAIL_MAX_BYTES = 512 * 1024;
