-- Voting is now available to anyone with the ballot link, once per device.
-- Remove legacy schedule constraints so Open and Close are the only controls.
UPDATE voting_config
SET method = 'open', starts_at = NULL, ends_at = NULL, updated_at = now()
WHERE id = 1;
