import 'dotenv/config';
import { supabase, isSupabaseConfigured } from '../src/services/supabaseClient';

// Idempotently provisions the fixed Supabase auth user that Playwright E2E
// specs log in as (see frontend/e2e/fixtures/auth.setup.ts). Safe to re-run —
// a no-op if the user already exists. Intended for a local `supabase start`
// instance, not a shared/production project.

async function seedE2eUser() {
  if (!isSupabaseConfigured) {
    console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set. Aborting.');
    process.exit(1);
  }

  const email = process.env.E2E_TEST_USER_EMAIL;
  const password = process.env.E2E_TEST_USER_PASSWORD;

  if (!email || !password) {
    console.error('E2E_TEST_USER_EMAIL / E2E_TEST_USER_PASSWORD are not set. Aborting.');
    process.exit(1);
  }

  const { data: existing, error: listError } = await supabase.auth.admin.listUsers();

  if (listError) {
    console.error('Failed to list existing users:', listError.message);
    process.exit(1);
  }

  const alreadyExists = existing.users.some((user) => user.email === email);

  if (alreadyExists) {
    console.log(`E2E test user already exists: ${email}`);
    return;
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (error) {
    console.error('Failed to create E2E test user:', error.message);
    process.exit(1);
  }

  console.log(`Created E2E test user: ${email} (id: ${data.user?.id})`);
}

seedE2eUser().catch((err) => {
  console.error('Unexpected error while seeding E2E test user:', err);
  process.exit(1);
});
