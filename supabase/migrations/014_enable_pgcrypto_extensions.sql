-- Ensures pgcrypto is available (Supabase: functions live in `extensions` schema).
-- Invitation RPCs in this repo now use gen_random_uuid() for tokens (see 003/010/011),
-- but this extension is still enabled for any other crypto helpers.
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
