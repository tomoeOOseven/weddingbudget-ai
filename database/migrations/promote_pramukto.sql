-- Promote Pramukto Mandal to super_admin
-- Run this in Supabase SQL Editor

update public.profiles
set
  role         = 'super_admin',
  full_name    = 'Pramukto Mandal',
  organisation = 'ehe',
  updated_at   = now()
where id = (
  select id from auth.users where email = 'pramuktoofficial@gmail.com'
);

-- Verify it worked — should return 1 row with role = super_admin
select id, email, role, full_name, organisation, is_active
from public.profiles
where id = (
  select id from auth.users where email = 'pramuktoofficial@gmail.com'
);
