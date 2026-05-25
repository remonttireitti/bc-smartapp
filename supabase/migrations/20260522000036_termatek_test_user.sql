-- Ensure Termatek test user exists in auth (prod + local after db reset without setup:dev).

DO $$
DECLARE
  user_id uuid := '00000000-0000-4000-8000-000000000004';
  company_id uuid := '44444444-4444-4444-8444-444444444444';
  user_email text := 'admin@t.test';
  user_password text := 'test123456';
  meta jsonb := jsonb_build_object(
    'company_id', company_id::text,
    'role', 'admin',
    'display_name', 'Admin Termatek'
  );
BEGIN
  IF EXISTS (SELECT 1 FROM auth.users WHERE email = user_email) THEN
    UPDATE auth.users
    SET
      encrypted_password = extensions.crypt(user_password, extensions.gen_salt('bf')),
      email_confirmed_at = coalesce(email_confirmed_at, now()),
      raw_user_meta_data = meta,
      updated_at = now()
    WHERE email = user_email;

    SELECT id INTO user_id FROM auth.users WHERE email = user_email LIMIT 1;
  ELSE
    INSERT INTO auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at,
      confirmation_token,
      email_change,
      email_change_token_new,
      recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      user_id,
      'authenticated',
      'authenticated',
      user_email,
      extensions.crypt(user_password, extensions.gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      meta,
      now(),
      now(),
      '',
      '',
      '',
      ''
    );

    INSERT INTO auth.identities (
      id,
      user_id,
      identity_data,
      provider,
      provider_id,
      last_sign_in_at,
      created_at,
      updated_at
    ) VALUES (
      user_id,
      user_id,
      jsonb_build_object('sub', user_id::text, 'email', user_email),
      'email',
      user_id::text,
      now(),
      now(),
      now()
    )
    ON CONFLICT (provider, provider_id) DO NOTHING;
  END IF;

  INSERT INTO public.profiles (id, company_id, email, display_name, role)
  VALUES (user_id, company_id, user_email, 'Admin Termatek', 'admin')
  ON CONFLICT (id) DO UPDATE SET
    company_id = EXCLUDED.company_id,
    email = EXCLUDED.email,
    display_name = EXCLUDED.display_name,
    role = EXCLUDED.role;
END;
$$;
