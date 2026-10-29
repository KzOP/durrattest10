/*
# Fix staff & admin login: username support + re-seed all accounts

1. Schema changes
- `staff_accounts.username` (text, unique): a login handle like "emp0@abcd0650" that staff
  type in the sign-in field instead of a phone number. Both phone and username work as login.

2. Authentication fix
- `authenticate_staff` accepts login as EITHER phone OR username (case-insensitive).
- All admin functions resolve admin identity by username OR phone.

3. Seeding
- All 10 official accounts re-seeded with username + known password. Super admin confirmed.

4. Security
- All functions SECURITY DEFINER, fixed search_path. REVOKE FROM PUBLIC, GRANT to anon+authenticated.
*/

ALTER TABLE public.staff_accounts
  ADD COLUMN IF NOT EXISTS username text;

CREATE UNIQUE INDEX IF NOT EXISTS staff_accounts_username_idx
  ON public.staff_accounts (lower(username))
  WHERE username IS NOT NULL;

-- Re-seed all 10 official accounts with usernames + passwords
INSERT INTO public.staff_accounts (display_name, phone, username, password_hash, active, is_super_admin)
VALUES
  ('الإدارة العامة',       '0539000650', 'emp0@abcd0650', md5('emp0@abcd0650'), true, true),
  ('عادل الحربي',           '0569996744', 'emp1@xytz6744', md5('emp1@xytz6744'), true, false),
  ('نادر الحربي (أبو اياد)', '0555071171', 'emp2@kswp1171', md5('emp2@kswp1171'), true, false),
  ('فيصل الحربي (أبو فهد)',  '0568849840', 'emp3@mrvq9840', md5('emp3@mrvq9840'), true, false),
  ('أحمد الحربي',           '0563436534', 'emp4@plnb6534', md5('emp4@plnb6534'), true, false),
  ('محمد الحربي',           '0549151396', 'emp5@ghjk1396', md5('emp5@ghjk1396'), true, false),
  ('سعد الحربي',            '0580710845', 'emp6@qwer0845', md5('emp6@qwer0845'), true, false),
  ('أحمد الزبدي',           '0543080031', 'emp7@zxcv0031', md5('emp7@zxcv0031'), true, false),
  ('نبيل',                  '0563071592', 'emp8@asdf1592', md5('emp8@asdf1592'), true, false),
  ('خالد المزيني',          '0533600487', 'emp9@asde0487', md5('emp9@asde0487'), true, false)
ON CONFLICT (phone) DO UPDATE
  SET username       = EXCLUDED.username,
      password_hash  = EXCLUDED.password_hash,
      active         = true,
      is_super_admin = EXCLUDED.is_super_admin;

-- Drop all existing functions first (signature changed for admin_create_staff)
DROP FUNCTION IF EXISTS public.authenticate_staff(text, text);
DROP FUNCTION IF EXISTS public.admin_list_staff(text, text);
DROP FUNCTION IF EXISTS public.admin_update_staff(text, text, uuid, text, text);
DROP FUNCTION IF EXISTS public.admin_create_staff(text, text, text, text, text);
DROP FUNCTION IF EXISTS public.admin_delete_staff(text, text, uuid);

-- authenticate_staff: match by username OR phone
CREATE FUNCTION public.authenticate_staff(p_login text, p_password text)
RETURNS TABLE (id uuid, display_name text, phone text, is_super_admin boolean)
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  SELECT s.id, s.display_name, s.phone, s.is_super_admin
  FROM public.staff_accounts s
  WHERE s.active = true
    AND s.password_hash = md5(coalesce(p_password, ''))
    AND (
      lower(s.username) = lower(trim(coalesce(p_login, '')))
      OR s.phone = regexp_replace(coalesce(p_login, ''), '[^0-9]', '', 'g')
    )
  LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION public.authenticate_staff(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.authenticate_staff(text, text) TO anon, authenticated;

-- admin_list_staff: returns username too
CREATE FUNCTION public.admin_list_staff(p_admin_login text, p_admin_password text)
RETURNS TABLE (id uuid, display_name text, phone text, username text, active boolean, is_super_admin boolean)
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  SELECT s.id, s.display_name, s.phone, s.username, s.active, s.is_super_admin
  FROM public.staff_accounts s
  WHERE EXISTS (
    SELECT 1 FROM public.staff_accounts a
    WHERE a.active = true AND a.is_super_admin = true
      AND a.password_hash = md5(coalesce(p_admin_password, ''))
      AND (
        lower(a.username) = lower(trim(coalesce(p_admin_login, '')))
        OR a.phone = regexp_replace(coalesce(p_admin_login, ''), '[^0-9]', '', 'g')
      )
  )
  ORDER BY s.created_at;
$$;

-- admin_update_staff: resolve admin by username OR phone
CREATE FUNCTION public.admin_update_staff(p_admin_login text, p_admin_password text, p_staff_id uuid, p_display_name text, p_new_password text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_admin_id uuid;
BEGIN
  SELECT a.id INTO v_admin_id
  FROM public.staff_accounts a
  WHERE a.active = true AND a.is_super_admin = true
    AND a.password_hash = md5(coalesce(p_admin_password, ''))
    AND (
      lower(a.username) = lower(trim(coalesce(p_admin_login, '')))
      OR a.phone = regexp_replace(coalesce(p_admin_login, ''), '[^0-9]', '', 'g')
    );
  IF v_admin_id IS NULL THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF p_display_name IS NULL OR length(trim(p_display_name)) < 2 THEN RAISE EXCEPTION 'Invalid name'; END IF;
  UPDATE public.staff_accounts
  SET display_name  = trim(p_display_name),
      password_hash = CASE WHEN coalesce(p_new_password, '') = '' THEN password_hash ELSE md5(p_new_password) END
  WHERE id = p_staff_id AND (is_super_admin = false OR id = v_admin_id);
  RETURN FOUND;
END;
$$;

-- admin_create_staff: now accepts username parameter
CREATE FUNCTION public.admin_create_staff(p_admin_login text, p_admin_password text, p_display_name text, p_phone text, p_new_password text, p_username text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_admin_id uuid;
BEGIN
  SELECT a.id INTO v_admin_id
  FROM public.staff_accounts a
  WHERE a.active = true AND a.is_super_admin = true
    AND a.password_hash = md5(coalesce(p_admin_password, ''))
    AND (
      lower(a.username) = lower(trim(coalesce(p_admin_login, '')))
      OR a.phone = regexp_replace(coalesce(p_admin_login, ''), '[^0-9]', '', 'g')
    );
  IF v_admin_id IS NULL THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF length(trim(coalesce(p_display_name, ''))) < 2
     OR regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g') !~ '^05[0-9]{8}$'
     OR length(coalesce(p_new_password, '')) < 8 THEN RAISE EXCEPTION 'Invalid staff data'; END IF;
  INSERT INTO public.staff_accounts (display_name, phone, username, password_hash)
  VALUES (trim(p_display_name), regexp_replace(p_phone, '[^0-9]', '', 'g'), trim(p_username), md5(p_new_password));
  RETURN true;
END;
$$;

-- admin_delete_staff: resolve admin by username OR phone
CREATE FUNCTION public.admin_delete_staff(p_admin_login text, p_admin_password text, p_staff_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_admin_id uuid;
BEGIN
  SELECT a.id INTO v_admin_id
  FROM public.staff_accounts a
  WHERE a.active = true AND a.is_super_admin = true
    AND a.password_hash = md5(coalesce(p_admin_password, ''))
    AND (
      lower(a.username) = lower(trim(coalesce(p_admin_login, '')))
      OR a.phone = regexp_replace(coalesce(p_admin_login, ''), '[^0-9]', '', 'g')
    );
  IF v_admin_id IS NULL THEN RAISE EXCEPTION 'Not authorized'; END IF;
  DELETE FROM public.staff_accounts WHERE id = p_staff_id AND is_super_admin = false;
  RETURN FOUND;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_list_staff(text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_update_staff(text, text, uuid, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_create_staff(text, text, text, text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_delete_staff(text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_staff(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_staff(text, text, uuid, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_create_staff(text, text, text, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_staff(text, text, uuid) TO anon, authenticated;
