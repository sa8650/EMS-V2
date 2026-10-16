-- EMS 5 — essential configuration only (no business records, no accounts).
-- The platform owner account is created in the app (Setup) after deployment.
-- Keep in sync with seedDefaults() in src/server/db/seeds.ts (used by factory reset).

-- Marks this database as an EMS 5 database; the app checks it before use.
INSERT INTO settings (key, value) VALUES ('schema', '{"product":"ems","version":5}');

-- Add-on catalogue (disabled until the owner sets it up).
INSERT INTO addons (key, title) VALUES
  ('connectx', 'ConnectX'),
  ('zudo', 'Zudo AI'),
  ('business_health', 'AI Business Health'),
  ('truebill', 'TrueBill'),
  ('vaultium', 'Vaultium');
