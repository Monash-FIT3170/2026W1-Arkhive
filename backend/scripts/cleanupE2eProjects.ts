import 'dotenv/config';
import { supabase, isSupabaseConfigured } from '../src/services/supabaseClient';

// Belt-and-suspenders cleanup for the E2E "projects" spec: deletes any
// leftover projects owned by the seeded E2E test user whose name starts with
// "E2E Project " (see frontend/e2e/projects.spec.ts, which names projects
// `E2E Project ${Date.now()}` and normally deletes its own project in
// afterEach — this only matters if a run crashed before cleanup ran).
// Not invoked automatically by Playwright; run manually/periodically.

const E2E_PROJECT_NAME_PREFIX = 'E2E Project ';

async function cleanupE2eProjects() {
  if (!isSupabaseConfigured) {
    console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set. Aborting.');
    process.exit(1);
  }

  const email = process.env.E2E_TEST_USER_EMAIL;
  if (!email) {
    console.error('E2E_TEST_USER_EMAIL is not set. Aborting.');
    process.exit(1);
  }

  const { data: users, error: listError } = await supabase.auth.admin.listUsers();
  if (listError) {
    console.error('Failed to list users:', listError.message);
    process.exit(1);
  }

  const testUser = users.users.find((user) => user.email === email);
  if (!testUser) {
    console.log(`No user found for ${email}; nothing to clean up.`);
    return;
  }

  const { data: projects, error: selectError } = await supabase
    .from('projects')
    .select('id, name')
    .eq('owner_id', testUser.id)
    .like('name', `${E2E_PROJECT_NAME_PREFIX}%`);

  if (selectError) {
    console.error('Failed to look up E2E projects:', selectError.message);
    process.exit(1);
  }

  if (!projects || projects.length === 0) {
    console.log('No leftover E2E projects found.');
    return;
  }

  const { error: deleteError } = await supabase
    .from('projects')
    .delete()
    .in('id', projects.map((p) => p.id));

  if (deleteError) {
    console.error('Failed to delete leftover E2E projects:', deleteError.message);
    process.exit(1);
  }

  console.log(`Deleted ${projects.length} leftover E2E project(s): ${projects.map((p) => p.name).join(', ')}`);
}

cleanupE2eProjects().catch((err) => {
  console.error('Unexpected error while cleaning up E2E projects:', err);
  process.exit(1);
});
