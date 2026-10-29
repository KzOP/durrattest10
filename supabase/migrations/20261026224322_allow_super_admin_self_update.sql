/*
# Allow the super administrator to update their own account

1. Modified behavior
- `admin_update_staff` now permits the verified super administrator to update their own display name and password.
- Non-administrator staff remain editable by the administrator, but administrator accounts cannot be changed by another target id.

2. Security
- The caller must still prove the current administrator phone and password inside the SECURITY DEFINER function.
- The function does not allow demotion, deletion, or changes to the administrator flag.
*/

CREATE OR REPLACE FUNCTION public.admin_update_staff(p_admin_phone text, p_admin_password text, p_staff_id uuid, p_display_name text, p_new_password text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_admin_id uuid;
BEGIN
  SELECT a.id INTO v_admin_id
  FROM public.staff_accounts a
  WHERE a.phone = regexp_replace(coalesce(p_admin_phone, ''), '[^0-9]', '', 'g')
    AND a.password_hash = md5(coalesce(p_admin_password, ''))
    AND a.active = true AND a.is_super_admin = true;
  IF v_admin_id IS NULL THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF p_display_name IS NULL OR length(trim(p_display_name)) < 2 THEN RAISE EXCEPTION 'Invalid name'; END IF;
  UPDATE public.staff_accounts
  SET display_name = trim(p_display_name),
      password_hash = CASE WHEN coalesce(p_new_password, '') = '' THEN password_hash ELSE md5(p_new_password) END
  WHERE id = p_staff_id AND (is_super_admin = false OR id = v_admin_id);
  RETURN FOUND;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_update_staff(text, text, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_update_staff(text, text, uuid, text, text) TO anon, authenticated;
