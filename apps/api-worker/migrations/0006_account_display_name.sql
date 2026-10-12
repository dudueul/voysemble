-- Copyright 2026- At Day. All rights reserved.
-- Slice 069: an account's own name. Travelers, leaders and guardians read it where the console's
-- owner or organizer did something (a chat message, an incident card, a fee row, the audit
-- trail) instead of "Owner" / "Organizer"; the email stays private. Null until set.
-- Sensitivity: 1 = ops.
ALTER TABLE accounts ADD COLUMN display_name TEXT; -- 1: as typed, 1..80 characters
