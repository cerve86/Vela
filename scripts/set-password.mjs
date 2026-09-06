#!/usr/bin/env node
/**
 * Puts a password on an existing account — for testing, and for App Review.
 *
 * Vela's clients sign in with an emailed code and have no password; the app's password
 * screen exists only because Apple's reviewer cannot read a code from a mailbox. This
 * script is the second legitimate use: a tester who wants to get in without waiting for
 * an email. It never creates an account and never prints the password.
 *
 *   SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SERVICE_ROLE_KEY=… \
 *   EMAIL=you@example.com PASSWORD='at least twelve characters' \
 *   SEED_ALLOW_REMOTE=1 node scripts/set-password.mjs
 */
import { createClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

const isLocal = /127\.0\.0\.1|localhost/.test(URL);
if (!isLocal && process.env.SEED_ALLOW_REMOTE !== '1') {
  throw new Error(`Refusing to touch ${URL} without SEED_ALLOW_REMOTE=1.`);
}

const email = (process.env.EMAIL ?? '').trim().toLowerCase();
const password = process.env.PASSWORD ?? '';
if (!email) throw new Error('EMAIL is required.');
if (password.length < 12) throw new Error('PASSWORD must be at least 12 characters.');

const admin = createClient(URL, SERVICE_KEY, { auth: { persistSession: false } });
const { data, error: listError } = await admin.auth.admin.listUsers({ perPage: 1000 });
if (listError) throw new Error(`list users: ${listError.message}`);
const user = data.users.find((u) => (u.email ?? '').toLowerCase() === email);
if (!user)
  throw new Error(
    `No account for ${email}. Invite or provision it first; this script does not create accounts.`,
  );

const { error } = await admin.auth.admin.updateUserById(user.id, { password });
if (error) throw new Error(`set password: ${error.message}`);
console.log(`✓ Password set for ${email}. In the app: "Use a password".`);
