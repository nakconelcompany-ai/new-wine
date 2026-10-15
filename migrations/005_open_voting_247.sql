-- Voting is open 24/7 with no schedule, and "anyone with the link, one vote per device" is the permanent method.
-- Clears any saved start/end times (they are no longer used) and makes 'open' the default.
UPDATE voting_config SET starts_at = NULL, ends_at = NULL, method = 'open', updated_at = now();
ALTER TABLE voting_config ALTER COLUMN method SET DEFAULT 'open';
