-- Copyright 2026- At Day. All rights reserved.
-- Global D1 schema, slice 006: accounts, sessions, magic links, organization directory,
-- memberships, invite codes. Mirrors src/db/schema.ts (keep both in step; a test compares them).
-- Timestamps are RFC 3339 UTC text. Secrets are never stored: only SHA-256 hashes of tokens.

CREATE TABLE accounts (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  locale TEXT NOT NULL DEFAULT 'ko',
  created_at TEXT NOT NULL,
  last_login_at TEXT
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  token_hash TEXT NOT NULL UNIQUE,
  client TEXT NOT NULL,                 -- web | native
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,             -- sliding, capped at created_at + 90 days
  last_seen_at TEXT NOT NULL,
  revoked_at TEXT
);
CREATE INDEX sessions_account_idx ON sessions(account_id);

CREATE TABLE magic_links (
  token_hash TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  locale TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT
);

CREATE TABLE organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  default_locale TEXT NOT NULL DEFAULT 'ko',
  created_by TEXT NOT NULL REFERENCES accounts(id),
  created_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'  -- active | suspended | deleted
);

CREATE TABLE memberships (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  role TEXT NOT NULL,                   -- owner | organizer | leader | member
  created_at TEXT NOT NULL,
  UNIQUE(account_id, organization_id)
);
CREATE INDEX memberships_org_idx ON memberships(organization_id);

CREATE TABLE invite_codes (
  code_hash TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  trip_id TEXT NOT NULL,
  participation_id TEXT NOT NULL,
  role TEXT NOT NULL,                   -- leader | traveler | guardian (never owner/organizer)
  created_by TEXT NOT NULL REFERENCES accounts(id),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  redeemed_at TEXT,
  redeemed_by TEXT REFERENCES accounts(id),
  revoked_at TEXT
);
CREATE INDEX invite_codes_participation_idx ON invite_codes(participation_id);
