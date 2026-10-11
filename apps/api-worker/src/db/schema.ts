// Copyright 2026- At Day. All rights reserved.
//
// Drizzle schema for the global D1 database. Source of truth for query typing; the SQL in
// ../../migrations is the source of truth for the deployed shape. test/schema.test.ts checks
// that every column here exists in the migrations so they cannot drift silently.

import { index, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const accounts = sqliteTable('accounts', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  locale: text('locale').notNull().default('ko'),
  createdAt: text('created_at').notNull(),
  lastLoginAt: text('last_login_at'),
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
