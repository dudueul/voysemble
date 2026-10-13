-- Copyright 2026- At Day. All rights reserved.
-- Slice 088 (D29): the push token of each signed-in phone, one per session. A token moves to the
-- session that registers it last; logout removes the session's row; delivery skips revoked or
-- expired sessions, so a remote wipe (D28) stops push at once. An APNs device token or an FCM
-- registration token addresses one install; it carries no identity by itself.
-- Sensitivity: 1 = ops.
CREATE TABLE push_devices (
  id TEXT PRIMARY KEY,                 -- 1: random UUID
  account_id TEXT NOT NULL REFERENCES accounts(id), -- 1
  session_id TEXT NOT NULL REFERENCES sessions(id), -- 1: the session that registered it
  platform TEXT NOT NULL,              -- 1: 'ios' | 'android'
  token TEXT NOT NULL UNIQUE,          -- 1: APNs device token or FCM registration token
  apns_environment TEXT,               -- 1: 'sandbox' | 'production' for iOS; null for Android
  created_at TEXT NOT NULL,            -- 1
  updated_at TEXT NOT NULL             -- 1
);
CREATE INDEX push_devices_account_idx ON push_devices(account_id);
CREATE INDEX push_devices_session_idx ON push_devices(session_id);
