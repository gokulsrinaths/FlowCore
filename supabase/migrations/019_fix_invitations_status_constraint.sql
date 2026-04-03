-- Repair invitations.status check when 018 was skipped or failed before section 1 completed.
-- Symptom: INSERT with status 'invited' fails with invitations_status_check (23514).

ALTER TABLE public.invitations
  DROP CONSTRAINT IF EXISTS invitations_status_check;

-- Normalize legacy values before adding the new check
UPDATE public.invitations
SET status = 'invited'
WHERE status = 'pending';

ALTER TABLE public.invitations
  ALTER COLUMN status SET DEFAULT 'invited';

ALTER TABLE public.invitations
  ADD CONSTRAINT invitations_status_check
  CHECK (status IN ('invited', 'registered', 'accepted', 'rejected'));
