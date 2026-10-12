// Copyright 2026- At Day. All rights reserved.
//
// Drizzle schema for the global D1 database. Source of truth for query typing; the SQL in
// ../../migrations is the source of truth for the deployed shape. test/schema.test.ts checks
// that every column here exists in the migrations so they cannot drift silently.

import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const accounts = sqliteTable('accounts', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  locale: text('locale').notNull().default('ko'),
  createdAt: text('created_at').notNull(),
  lastLoginAt: text('last_login_at'),
  /** Slice 069: the account's own name for whatever it does on a trip; null until set. */
  displayName: text('display_name'),
  /** Slice 081: the incident emails switch (migration 0007); on by default. */
  incidentEmails: integer('incident_emails', { mode: 'boolean' }).notNull().default(true),
});

export const sessions = sqliteTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id')
      .notNull()
      .references(() => accounts.id),
    tokenHash: text('token_hash').notNull().unique(),
    client: text('client', { enum: ['web', 'native'] }).notNull(),
    createdAt: text('created_at').notNull(),
    expiresAt: text('expires_at').notNull(),
    lastSeenAt: text('last_seen_at').notNull(),
    revokedAt: text('revoked_at'),
    /** 'wipe' when the organizer revoked the devices (D28); null for a logout. */
    revokedReason: text('revoked_reason'),
    /** Slice 045 (D35): the last step-up confirmation through an emailed link; null until one. */
    reauthedAt: text('reauthed_at'),
  },
  (t) => [index('sessions_account_idx').on(t.accountId)],
);

export const magicLinks = sqliteTable('magic_links', {
  tokenHash: text('token_hash').primaryKey(),
  email: text('email').notNull(),
  locale: text('locale').notNull(),
  createdAt: text('created_at').notNull(),
  expiresAt: text('expires_at').notNull(),
  consumedAt: text('consumed_at'),
  /** Slice 045 (D35): 'signin' mints a session; 'reauth' confirms an existing one. */
  purpose: text('purpose', { enum: ['signin', 'reauth'] })
    .notNull()
    .default('signin'),
});

export const organizations = sqliteTable('organizations', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  defaultLocale: text('default_locale').notNull().default('ko'),
  createdBy: text('created_by')
    .notNull()
    .references(() => accounts.id),
  createdAt: text('created_at').notNull(),
  status: text('status', { enum: ['active', 'suspended', 'deleted'] })
    .notNull()
    .default('active'),
  // Slice 036 (migration 0003): settings edited on the console; D29 and D20 read them later.
  timeZone: text('time_zone').notNull().default('Asia/Seoul'),
  quietFrom: text('quiet_from').notNull().default('23:00'),
  quietTo: text('quiet_to').notNull().default('06:30'),
  digestAt: text('digest_at').notNull().default('19:00'),
  wrapUpDays: integer('wrap_up_days').notNull().default(90),
});

export const memberships = sqliteTable(
  'memberships',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id')
      .notNull()
      .references(() => accounts.id),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organizations.id),
    role: text('role', { enum: ['owner', 'organizer', 'leader', 'member'] }).notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => [
    uniqueIndex('memberships_account_org_uq').on(t.accountId, t.organizationId),
    index('memberships_org_idx').on(t.organizationId),
  ],
);

/**
 * Slice 042 (D33, migration 0004): one-time emailed invitations that make an account an organizer
 * of the organization. Only the token's hash is stored; the email is PII (tier 2).
 */
export const organizationInvitations = sqliteTable(
  'organization_invitations',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organizations.id),
    /** Lower-cased; the account that accepts must carry it. */
    email: text('email').notNull(),
    role: text('role', { enum: ['organizer'] }).notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    locale: text('locale').notNull(),
    invitedBy: text('invited_by')
      .notNull()
      .references(() => accounts.id),
    createdAt: text('created_at').notNull(),
    expiresAt: text('expires_at').notNull(),
    acceptedAt: text('accepted_at'),
    acceptedBy: text('accepted_by').references(() => accounts.id),
    revokedAt: text('revoked_at'),
  },
  (t) => [index('organization_invitations_org_idx').on(t.organizationId)],
);

export const inviteCodes = sqliteTable(
  'invite_codes',
  {
    codeHash: text('code_hash').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organizations.id),
    tripId: text('trip_id').notNull(),
    participationId: text('participation_id').notNull(),
    role: text('role', { enum: ['leader', 'traveler', 'guardian'] }).notNull(),
    createdBy: text('created_by')
      .notNull()
      .references(() => accounts.id),
    createdAt: text('created_at').notNull(),
    expiresAt: text('expires_at').notNull(),
    redeemedAt: text('redeemed_at'),
    redeemedBy: text('redeemed_by').references(() => accounts.id),
    revokedAt: text('revoked_at'),
  },
  (t) => [index('invite_codes_participation_idx').on(t.participationId)],
);
