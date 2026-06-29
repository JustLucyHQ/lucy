-- Seed an API key for admin@contractorsroom.com
-- This key is used by Contractors Room to call Lucy's screening API.
--
-- IMPORTANT: After running this, the key hash is in the DB.
-- You must also generate the actual key via the API or the Node script below.
-- This SQL only works if the admin user already exists in auth.users.

-- To generate and seed a key programmatically, run:
--   npx tsx lib/scripts/seed-admin-key.ts
-- from the LucyAI directory. The script prints the key to stdout.
