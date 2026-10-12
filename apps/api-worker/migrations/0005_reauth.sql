-- Copyright 2026- At Day. All rights reserved.
-- Slice 045 (D35): step-up reauthentication. A magic link now carries a purpose: "signin" mints a
-- session as before; "reauth" is emailed to a signed-in account and, verified by that same
-- session, stamps sessions.reauthed_at. Routes that need a fresh proof (the document scan
-- reveal) require the stamp to be younger than ten minutes.
-- Sensitivity: 1 = ops.
ALTER TABLE magic_links ADD COLUMN purpose TEXT NOT NULL DEFAULT 'signin'; -- 1: signin | reauth
ALTER TABLE sessions ADD COLUMN reauthed_at TEXT;                           -- 1: RFC 3339 UTC of the last confirmation
