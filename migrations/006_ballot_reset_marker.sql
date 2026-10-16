-- Lets browsers detect an admin ballot reset and remove their local "already voted" marker.
ALTER TABLE voting_config ADD COLUMN ballots_reset_at timestamptz;

-- Treat the existing ballot state as reset so devices that voted before this
-- feature was added can vote again after the deployment.
UPDATE voting_config SET ballots_reset_at = now() WHERE id = 1;
