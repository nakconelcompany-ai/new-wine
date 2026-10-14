-- Best Dressed becomes two awards: Male and Female.
-- Existing installs: rename the old category (keeping its nominees and votes) and make room for the new one.
-- Fresh installs: these statements change nothing; scripts/seed.mjs creates all categories.
UPDATE categories SET display_order = 14 WHERE key = 'most-energetic-member' AND display_order = 13;
UPDATE categories SET key = 'best-dressed-male', name = 'Best Dressed (Male)', updated_at = now() WHERE key = 'best-dressed';
