-- Copyright 2026- At Day. All rights reserved.
-- Slice 036: organization settings edited on the console. Time zone the organization plans in,
-- quiet hours and the guardian digest hour (D29), and the wrap-up window in days before a closed
-- trip's personal data is shredded (D20). Defaults are the decisions' defaults.
ALTER TABLE organizations ADD COLUMN time_zone TEXT NOT NULL DEFAULT 'Asia/Seoul';
ALTER TABLE organizations ADD COLUMN quiet_from TEXT NOT NULL DEFAULT '23:00';
ALTER TABLE organizations ADD COLUMN quiet_to TEXT NOT NULL DEFAULT '06:30';
ALTER TABLE organizations ADD COLUMN digest_at TEXT NOT NULL DEFAULT '19:00';
ALTER TABLE organizations ADD COLUMN wrap_up_days INTEGER NOT NULL DEFAULT 90;
