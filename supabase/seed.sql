-- Dev test users (run after supabase start + db reset)
-- Create via Supabase Studio Auth UI, then link profile:

-- Example: admin@x.test / password123
-- Metadata: {"company_id": "11111111-1111-4111-8111-111111111111", "role": "admin"}

-- Or use SQL in Studio after creating auth user manually:
-- UPDATE profiles SET company_id = '11111111-1111-4111-8111-111111111111', role = 'admin'
-- WHERE email = 'admin@x.test';
