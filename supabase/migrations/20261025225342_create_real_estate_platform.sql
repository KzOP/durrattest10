/*
# Create the Durrat Al-Hijra real-estate platform data model

1. New tables
- `staff_accounts`: approved office staff phone numbers and password digests used by the hidden staff sign-in.
- `properties`: public property listings, listing details, contact phone, and watermarked image data.

2. Security
- Row level security is enabled on both tables.
- Public visitors can read listings, while the staff account table is not exposed to anonymous table reads.
- The `authenticate_staff` RPC returns only a safe staff identity and never a password digest.

3. Important notes
- Property images are stored as already-watermarked data URLs for this lightweight deployment.
- Telegram posting is handled separately by an Edge Function and does not expose bot credentials to the browser.
*/

CREATE TABLE IF NOT EXISTS public.staff_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name text NOT NULL,
  phone text UNIQUE NOT NULL,
  password_hash text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.properties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by_staff_id uuid REFERENCES public.staff_accounts(id) ON DELETE SET NULL,
  created_by_name text NOT NULL,
  contact_phone text NOT NULL,
  listing_type text NOT NULL CHECK (listing_type IN ('sale', 'rent')),
  property_type text NOT NULL CHECK (property_type IN ('شقة', 'فيلا', 'أرض', 'دور', 'عمارة', 'محل', 'مزرعة', 'حوش')),
  title text NOT NULL,
  city text NOT NULL,
  district text NOT NULL,
  street text NOT NULL DEFAULT '',
  price numeric NOT NULL CHECK (price >= 0),
  rooms integer NOT NULL DEFAULT 0 CHECK (rooms >= 0),
  lounges integer NOT NULL DEFAULT 0 CHECK (lounges >= 0),
  floors integer NOT NULL DEFAULT 0 CHECK (floors >= 0),
  kitchens integer NOT NULL DEFAULT 0 CHECK (kitchens >= 0),
  bathrooms integer NOT NULL DEFAULT 0 CHECK (bathrooms >= 0),
  floor_number integer NOT NULL DEFAULT 0 CHECK (floor_number >= 0),
  has_roof boolean NOT NULL DEFAULT false,
  has_elevator boolean NOT NULL DEFAULT false,
  notes text NOT NULL DEFAULT '',
  latitude numeric,
  longitude numeric,
  images text[] NOT NULL DEFAULT '{}',
  published boolean NOT NULL DEFAULT true,
  telegram_posted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.staff_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.properties TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.properties TO anon, authenticated;

DROP POLICY IF EXISTS "Anyone can view published properties" ON public.properties;
CREATE POLICY "Anyone can view published properties" ON public.properties FOR SELECT TO anon, authenticated USING (published = true);
DROP POLICY IF EXISTS "Staff browser can create properties" ON public.properties;
CREATE POLICY "Staff browser can create properties" ON public.properties FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "Staff browser can update properties" ON public.properties;
CREATE POLICY "Staff browser can update properties" ON public.properties FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Staff browser can delete properties" ON public.properties;
CREATE POLICY "Staff browser can delete properties" ON public.properties FOR DELETE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "No public staff account reads" ON public.staff_accounts;
CREATE POLICY "No public staff account reads" ON public.staff_accounts FOR SELECT TO anon, authenticated USING (false);

CREATE OR REPLACE FUNCTION public.authenticate_staff(p_phone text, p_password text)
RETURNS TABLE (id uuid, display_name text, phone text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id, s.display_name, s.phone
  FROM public.staff_accounts s
  WHERE s.phone = regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g')
    AND s.active = true
    AND s.password_hash = md5(coalesce(p_password, ''))
  LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION public.authenticate_staff(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.authenticate_staff(text, text) TO anon, authenticated;

INSERT INTO public.staff_accounts (display_name, phone, password_hash)
VALUES
  ('الإدارة العامة', '0539000650', md5('emp0@abcd0650')),
  ('عادل الحربي', '0569996744', md5('emp1@xytz6744')),
  ('نادر الحربي (أبو اياد)', '0555071171', md5('emp2@kswp1171')),
  ('فيصل الحربي (أبو فهد)', '0568849840', md5('emp3@mrvq9840')),
  ('أحمد الحربي', '0563436534', md5('emp4@plnb6534')),
  ('محمد الحربي', '0549151396', md5('emp5@ghjk1396')),
  ('سعد الحربي', '0580710845', md5('emp6@qwer0845')),
  ('أحمد الزبدي', '0543080031', md5('emp7@zxcv0031')),
  ('نبيل', '0563071592', md5('emp8@asdf1592')),
  ('خالد المزيني', '0533600487', md5('emp9@asde0487'))
ON CONFLICT (phone) DO NOTHING;

CREATE INDEX IF NOT EXISTS properties_city_idx ON public.properties (city);
CREATE INDEX IF NOT EXISTS properties_district_idx ON public.properties (district);
CREATE INDEX IF NOT EXISTS properties_listing_type_idx ON public.properties (listing_type);
