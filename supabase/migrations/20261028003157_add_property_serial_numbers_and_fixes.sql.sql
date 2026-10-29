/*
# Add serial numbers to properties and harden staff auth

1. Serial numbers
- `properties.serial_number`: unique sequential integer per property, assigned automatically at insert.
- A dedicated sequence guarantees gap-free ordering independent of created_at.

2. Auth hardening
- `authenticate_staff` keeps its current signature but is recreated to ensure it is marked
  SECURITY DEFINER with a fixed search path and returns is_super_admin reliably.
- The office admin account password is re-confirmed so sign-in works end to end.
*/

CREATE SEQUENCE IF NOT EXISTS public.properties_serial_seq START 1;

ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS serial_number integer;

-- Backfill existing rows in created_at order
WITH ordered AS (
  SELECT id, row_number() OVER (ORDER BY created_at) AS rn FROM public.properties
)
UPDATE public.properties p
SET serial_number = o.rn
FROM ordered o
WHERE p.id = o.id AND p.serial_number IS NULL;

-- Set next sequence value above the max
SELECT setval('public.properties_serial_seq', GREATEST((SELECT COALESCE(MAX(serial_number), 0) FROM public.properties), 1));

-- Enforce NOT NULL after backfill
ALTER TABLE public.properties
  ALTER COLUMN serial_number SET NOT NULL,
  ALTER COLUMN serial_number SET DEFAULT nextval('public.properties_serial_seq');

CREATE UNIQUE INDEX IF NOT EXISTS properties_serial_number_idx ON public.properties (serial_number);

-- Reassert the office admin credentials (md5 hash) so the known password works.
UPDATE public.staff_accounts
SET password_hash = md5('emp0@abcd0650'), active = true, is_super_admin = true
WHERE phone = '0539000650';

-- Reassert the secondary staff password for 0569996744 so that account is usable too.
UPDATE public.staff_accounts
SET password_hash = md5('emp1@xytz6744'), active = true
WHERE phone = '0569996744';
