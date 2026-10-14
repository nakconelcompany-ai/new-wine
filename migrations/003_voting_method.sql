-- Admin-selectable voting method. Default stays 'codes' so existing behaviour does not change.
--   codes : each voter needs a personal one-time code
--   open  : anyone with the link can vote once per device (cookie-based)
ALTER TABLE voting_config ADD COLUMN method text NOT NULL DEFAULT 'codes' CHECK (method IN ('codes', 'open'));
-- 'device' rows are created automatically in open mode; they are not real voting codes
ALTER TABLE voter_codes ADD COLUMN kind text NOT NULL DEFAULT 'code' CHECK (kind IN ('code', 'device'));
