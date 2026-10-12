-- Copyright 2026- At Day. All rights reserved.
-- Slice 031 (D28): why a session was revoked. "wipe" means the organizer revoked the person's
-- devices; the next request from that session answers 401 with X-Voysemble-Wipe: 1 and the app
-- clears its local state. NULL for an ordinary logout.
ALTER TABLE sessions ADD COLUMN revoked_reason TEXT;
