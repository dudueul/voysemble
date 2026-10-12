-- Copyright 2026- At Day. All rights reserved.
-- Slice 042 (D33): organizer invitations. An owner invites a colleague by email from the console;
-- the emailed link carries a one-time token, and the signed-in account that carries the invited
-- address accepts it and becomes an organizer. Invite codes (invite_codes) stay for leaders,
-- travelers and guardians and never grant console authority. Mirrors src/db/schema.ts.
-- Sensitivity: 1 = ops, 2 = PII, 3 = document.
CREATE TABLE organization_invitations (
  id TEXT PRIMARY KEY,                                        -- 1: server-minted UUID
  organization_id TEXT NOT NULL REFERENCES organizations(id), -- 1
  email TEXT NOT NULL,                                        -- 2: the invitee's address, lower-cased; the accepting account must carry it
  role TEXT NOT NULL,                                         -- 1: organizer (never owner)
  token_hash TEXT NOT NULL UNIQUE,                            -- 1: SHA-256 of the one-time token; the plaintext lives only in the email
  locale TEXT NOT NULL,                                       -- 1: language of the email (ko | en)
  invited_by TEXT NOT NULL REFERENCES accounts(id),           -- 1: the owner who sent it
  created_at TEXT NOT NULL,                                   -- 1: RFC 3339 UTC
  expires_at TEXT NOT NULL,                                   -- 1: created_at + 7 days
  accepted_at TEXT,                                           -- 1: set once, atomically
  accepted_by TEXT REFERENCES accounts(id),                   -- 1: the account that accepted
  revoked_at TEXT                                             -- 1: set by the owner (or by a re-invitation of the same address)
);
CREATE INDEX organization_invitations_org_idx ON organization_invitations(organization_id);
