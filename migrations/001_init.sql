-- New Wine Choir Awards: initial schema (additive, safe to run once; tracked by scripts/migrate.mjs)

CREATE TABLE categories (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key           text NOT NULL UNIQUE,
  name          text NOT NULL,
  display_order integer NOT NULL UNIQUE,
  required      boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE nominees (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id  uuid NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  display_name text NOT NULL CHECK (char_length(btrim(display_name)) BETWEEN 2 AND 80),
  name_key     text NOT NULL,
  published    boolean NOT NULL DEFAULT false,
  archived_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (category_id, name_key),
  UNIQUE (id, category_id)
);
CREATE INDEX nominees_category_idx ON nominees (category_id);

CREATE TABLE voter_codes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code_hash  text NOT NULL UNIQUE,
  label      text,
  status     text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  used_at    timestamptz,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE ballots (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  voter_code_id uuid NOT NULL UNIQUE REFERENCES voter_codes(id) ON DELETE RESTRICT,
  submitted_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE ballot_selections (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ballot_id   uuid NOT NULL REFERENCES ballots(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  nominee_id  uuid NOT NULL,
  UNIQUE (ballot_id, category_id),
  -- A nominee can only be chosen in the category it belongs to (enforced by the database itself)
  FOREIGN KEY (nominee_id, category_id) REFERENCES nominees (id, category_id) ON DELETE RESTRICT
);
CREATE INDEX ballot_selections_tally_idx ON ballot_selections (category_id, nominee_id);

CREATE TABLE voting_config (
  id                   integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  status               text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'open', 'closed')),
  starts_at            timestamptz,
  ends_at              timestamptz,
  results_published    boolean NOT NULL DEFAULT false,
  results_published_at timestamptz,
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at)
);
INSERT INTO voting_config (id) VALUES (1) ON CONFLICT DO NOTHING;

-- Admin password changed from inside the dashboard (overrides ADMIN_PASSWORD_HASH once set)
CREATE TABLE admin_credentials (
  id            integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  password_hash text NOT NULL,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE rate_limits (
  bucket       text NOT NULL,
  window_start timestamptz NOT NULL,
  count        integer NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket, window_start)
);
