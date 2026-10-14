-- Categories can be switched off (kept with their history) when the category list changes.
ALTER TABLE categories ADD COLUMN active boolean NOT NULL DEFAULT true;
-- Display order only needs to sort; allowing duplicates lets the list be replaced without clashes.
ALTER TABLE categories DROP CONSTRAINT IF EXISTS categories_display_order_key;
