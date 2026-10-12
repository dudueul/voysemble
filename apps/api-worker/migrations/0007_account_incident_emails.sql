-- Copyright 2026- At Day. All rights reserved.
-- Slice 081: whether the account wants the incident emails (a card opened from a phone, a head
-- count closed with people missing; slices 076 and 078). On by default; an owner or organizer
-- turns it off on the console's Settings page. The lanes to leaders and guardians are unaffected.
-- Sensitivity: 1 = ops.
ALTER TABLE accounts ADD COLUMN incident_emails INTEGER NOT NULL DEFAULT 1; -- 1: 1 = yes, 0 = no
