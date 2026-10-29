/*
# Tighten staff account table access

1. Security changes
- Remove direct Data API table privileges from `staff_accounts` for anonymous and signed-in browser roles.
- Keep only the narrowly scoped `authenticate_staff` function available for sign-in.

2. Important notes
- The function returns only staff identity fields after checking the submitted credentials.
- No staff password digest is readable through the browser table API.
*/

REVOKE ALL ON TABLE public.staff_accounts FROM anon, authenticated;
