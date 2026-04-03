-- Fix 23514: new row violates invitations_status_check
-- Happens when RPCs from 018+ insert status 'invited' but the DB still has 017's check
-- (pending | accepted | rejected). Safe to run even if 018/019 already fixed this.
--
-- If the error persists after this runs, the DB likely has the NEW check but OLD RPCs
-- that still INSERT 'pending' — run 022_invitations_constraint_plus_create_rpcs.sql next.

ALTER TABLE public.invitations
  DROP CONSTRAINT IF EXISTS invitations_status_check;

UPDATE public.invitations
SET status = 'invited'
WHERE status = 'pending';

ALTER TABLE public.invitations
  ALTER COLUMN status SET DEFAULT 'invited';

ALTER TABLE public.invitations
  ADD CONSTRAINT invitations_status_check
  CHECK (status IN ('invited', 'registered', 'accepted', 'rejected'));
