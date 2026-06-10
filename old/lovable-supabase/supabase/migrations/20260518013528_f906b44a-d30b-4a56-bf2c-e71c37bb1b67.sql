-- Reset passwords for all users to temporary default and confirm emails
UPDATE auth.users
SET 
  encrypted_password = crypt('Career2026!', gen_salt('bf')),
  email_confirmed_at = COALESCE(email_confirmed_at, now()),
  updated_at = now()
WHERE email IS NOT NULL;