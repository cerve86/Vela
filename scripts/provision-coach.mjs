#!/usr/bin/env node
/**
 * Provisions a coach account.
 *
 * A coach is an auth user whose profile says so and who owns a row in `coaches`. The
 * sign-in trigger creates every new user as a client; promotion is deliberate, which is
 * why this script exists rather than a checkbox. No email is sent: the account is
 * created confirmed, and she signs in to the portal with the usual emailed code.
 *
 * Idempotent — run it again to fix a name or a practice, or to promote an existing user.
 *
 *   COACH_EMAIL=her@practice.com FIRST_NAME=Her LAST_NAME=Name PRACTICE_NAME='Her Practice' \
 *   node scripts/provision-coach.mjs
 *
 *   SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SERVICE_ROLE_KEY=… \
 *   COACH_EMAIL=… FIRST_NAME=… LAST_NAME=… PRACTICE_NAME='…' \
 *   SEED_ALLOW_REMOTE=1 node scripts/provision-coach.mjs
 */
import { createClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

const isLocal = /127\.0\.0\.1|localhost/.test(URL);
if (!isLocal && process.env.SEED_ALLOW_REMOTE !== '1') {
  throw new Error(
    `Refusing to touch ${URL} without SEED_ALLOW_REMOTE=1. This script creates an account.`,
  );
}

const email = (process.env.COACH_EMAIL ?? '').trim().toLowerCase();
const firstName = (process.env.FIRST_NAME ?? '').trim();
const lastName = (process.env.LAST_NAME ?? '').trim();
const practiceName = (process.env.PRACTICE_NAME ?? '').trim() || `${firstName} ${lastName}`.trim();
if (!email || !firstName) throw new Error('COACH_EMAIL and FIRST_NAME are required.');

const admin = createClient(URL, SERVICE_KEY, { auth: { persistSession: false } });

function check(label, { error }) {
  if (error) throw new Error(`${label}: ${error.message}`);
}

console.log(`→ ${email} on ${URL}`);

const { data: listed, error: listError } = await admin.auth.admin.listUsers({ perPage: 1000 });
check('list users', { error: listError });
let user = listed.users.find((u) => (u.email ?? '').toLowerCase() === email) ?? null;

if (user) {
  console.log(`  account exists (${user.id.slice(0, 8)}), promoting`);
  check(
    'update user',
    await admin.auth.admin.updateUserById(user.id, {
      user_metadata: { first_name: firstName, last_name: lastName },
    }),
  );
} else {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { first_name: firstName, last_name: lastName },
  });
  check('create user', { error });
  user = data.user;
  console.log(`  account created (${user.id.slice(0, 8)}), confirmed, no email sent`);
}

// The trigger made her a client; a coach is promoted on purpose.
check(
  'promote profile',
  await admin
    .from('profiles')
    .upsert(
      { id: user.id, role: 'coach', first_name: firstName, last_name: lastName },
      { onConflict: 'id' },
    ),
);
check(
  'practice',
  await admin
    .from('coaches')
    .upsert({ id: user.id, practice_name: practiceName }, { onConflict: 'id' }),
);

console.log(
  `✓ ${firstName} ${lastName} is a coach at "${practiceName}". She signs in at the portal with a code sent to ${email}.`,
);
