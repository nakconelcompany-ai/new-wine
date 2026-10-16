-- Lets browsers detect an admin ballot reset and remove their local "already voted" marker.
ALTER TABLE voting_config ADD COLUMN ballots_reset_at timestamptz;
