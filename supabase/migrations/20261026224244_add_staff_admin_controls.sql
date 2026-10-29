/*
# Add secure staff administration controls

1. Modified tables
- `staff_accounts.is_super_admin`: marks the account allowed to manage office staff.
- The office account `0539000650` is marked as the super administrator.

2. New server functions
- `authenticate_staff`: returns the staff identity and administrator flag after checking credentials.
- `admin_list_staff`: lists staff only after verifying the administrator phone and password.
- `admin_update_staff`: changes a staff display name or password only after verifying the administrator.
- `admin_create_staff`: adds an additional staff account only after verifying the administrator.
- `admin_delete_staff`: removes a non-administrator staff account only after verifying the administrator.

3. Security
- All administration functions run with a fixed search path and verify the administrator inside the database.
- Functions return safe fields only and never expose password digests.
- Direct table access to staff accounts remains revoked for browser roles.

4. Important notes
- The three additional staff accounts can be created from the administration panel because their names and credentials were not supplied.
- The administrator cannot delete or demote the administrator account.
*/

ALTER TABLE public.staff_accounts
  ADD COLUMN IF NOT EXISTS is_super_admin boolean NOT NULL DEFAULT false;

UPDATE public.staff_accounts SET is_super_admin = true WHERE phone = '0539000650';

DROP FUNCTION IF EXISTS public.authenticate_staff(text, text);
CREATE FUNCTION public.authenticate_staff(p_phone text, p_password text)
RETURNS TABLE (id uuid, display_name text, phone text, is_super_admin boolean)
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  SELECT s.id, s.display_name, s.phone, s.is_super_admin
  FROM public.staff_accounts s
  WHERE s.phone = regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g')
    AND s.active = true
    AND s.password_hash = md5(coalesce(p_password, ''))
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_staff(p_admin_phone text, p_admin_password text)
RETURNS TABLE (id uuid, display_name text, phone text, active boolean, is_super_admin boolean)
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  SELECT s.id, s.display_name, s.phone, s.active, s.is_super_admin
  FROM public.staff_accounts s
  WHERE EXISTS (
    SELECT 1 FROM public.staff_accounts a
    WHERE a.phone = regexp_replace(coalesce(p_admin_phone, ''), '[^0-9]', '', 'g')
      AND a.password_hash = md5(coalesce(p_admin_password, ''))
      AND a.active = true AND a.is_super_admin = true
  )
  ORDER BY s.created_at;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_staff(p_admin_phone text, p_admin_password text, p_staff_id uuid, p_display_name text, p_new_password text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.staff_accounts a
    WHERE a.phone = regexp_replace(coalesce(p_admin_phone, ''), '[^0-9]', '', 'g')
      AND a.password_hash = md5(coalesce(p_admin_password, ''))
      AND a.active = true AND a.is_super_admin = true
  ) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF p_display_name IS NULL OR length(trim(p_display_name)) < 2 THEN RAISE EXCEPTION 'Invalid name'; END IF;
  UPDATE public.staff_accounts
  SET display_name = trim(p_display_name),
      password_hash = CASE WHEN coalesce(p_new_password, '') = '' THEN password_hash ELSE md5(p_new_password) END
  WHERE id = p_staff_id AND is_super_admin = false;
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_create_staff(p_admin_phone text, p_admin_password text, p_display_name text, p_phone text, p_new_password text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.staff_accounts a
    WHERE a.phone = regexp_replace(coalesce(p_admin_phone, ''), '[^0-9]', '', 'g')
      AND a.password_hash = md5(coalesce(p_admin_password, ''))
      AND a.active = true AND a.is_super_admin = true
  ) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF length(trim(coalesce(p_display_name, ''))) < 2 OR regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g') !~ '^05[0-9]{8}$' OR length(coalesce(p_new_password, '')) < 8 THEN RAISE EXCEPTION 'Invalid staff data'; END IF;
  INSERT INTO public.staff_accounts (display_name, phone, password_hash)
  VALUES (trim(p_display_name), regexp_replace(p_phone, '[^0-9]', '', 'g'), md5(p_new_password));
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_delete_staff(p_admin_phone text, p_admin_password text, p_staff_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.staff_accounts a
    WHERE a.phone = regexp_replace(coalesce(p_admin_phone, ''), '[^0-9]', '', 'g')
      AND a.password_hash = md5(coalesce(p_admin_password, ''))
      AND a.active = true AND a.is_super_admin = true
  ) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  DELETE FROM public.staff_accounts WHERE id = p_staff_id AND is_super_admin = false;
  RETURN FOUND;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.authenticate_staff(text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_list_staff(text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_update_staff(text, text, uuid, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_create_staff(text, text, text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_delete_staff(text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.authenticate_staff(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_staff(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_staff(text, text, uuid, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_create_staff(text, text, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_staff(text, text, uuid) TO anon, authenticated;
