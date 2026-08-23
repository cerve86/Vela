#!/usr/bin/env node
/**
 * Provisions the account Apple's reviewer signs in with.
 *
 * Guideline 2.1 obliges us to hand over working credentials, and Vela signs in with a code
 * emailed to the client — which a reviewer cannot receive. Supabase has no email equivalent
 * of `auth.sms.test_otp`, so a fixed code is not available; this account therefore carries a
 * password, and the app has one screen that accepts one.
 *
 * The password is never written down here. It arrives in the environment and goes into App
 * Store Connect, and nowhere else — this repository is public, so a literal in this file
 * would be a world-readable way into the account.
 *
 * Everything is written through the real flow, as the real users: the coach issues an
 * invite, the review client accepts it by signing in WITH HER PASSWORD, consents, and logs
 * her own data. That makes running this a test of the password path rather than only a seed.
 * If password sign-in is broken, this script fails at step 3.
 *
 *   REVIEW_PASSWORD='…' node scripts/provision-review-account.mjs
 *
 *   SUPABASE_URL=https://<ref>.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=… SUPABASE_ANON_KEY=… \
 *   COACH_EMAIL=you@practice.com REVIEW_PASSWORD='…' \
 *   SEED_ALLOW_REMOTE=1 node scripts/provision-review-account.mjs
 */
import { createClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const ANON_KEY =
  process.env.SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

const isLocal = /127\.0\.0\.1|localhost/.test(URL);
if (!isLocal && process.env.SEED_ALLOW_REMOTE !== '1') {
  throw new Error(
    `Refusing to touch ${URL} without SEED_ALLOW_REMOTE=1. This script writes a client, a programme and sessions.`,
  );
}

const COACH_EMAIL = process.env.COACH_EMAIL ?? 'coach@vela.test';
const REVIEW_EMAIL = process.env.REVIEW_EMAIL ?? 'review@vela-coaching.com';
const PASSWORD = process.env.REVIEW_PASSWORD;
const POLICY_VERSION = '2026-08-01';

if (!PASSWORD) {
  throw new Error(
    'REVIEW_PASSWORD is required and is deliberately not defaulted — it must not live in this repository.',
  );
}
if (PASSWORD.length < 12) {
  // Supabase's floor is 6. This is the account named in a public App Store submission, so
  // it gets a real password rather than the minimum the platform tolerates.
  throw new Error('REVIEW_PASSWORD must be at least 12 characters.');
}

const admin = createClient(URL, SERVICE_KEY, { auth: { persistSession: false } });

function check(label, { error }) {
  if (error) throw new Error(`${label}: ${error.message ?? error}`);
}

function day(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Signs in without a password, for the coach — she has none and should not need one. */
async function signInAsCoach(email) {
  const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (error) throw new Error(`generateLink(${email}): ${error.message}`);
  const client = createClient(URL, ANON_KEY, { auth: { persistSession: false } });
  const { error: verifyError } = await client.auth.verifyOtp({
    token_hash: data.properties.hashed_token,
    type: 'magiclink',
  });
  if (verifyError) throw new Error(`verifyOtp(${email}): ${verifyError.message}`);
  return client;
}

// ---------------------------------------------------------------------------

console.log(`→ target ${URL}`);
console.log('→ signing in as the coach');
const coach = await signInAsCoach(COACH_EMAIL);
const coachId = (await coach.auth.getUser()).data.user.id;

console.log(`→ inviting ${REVIEW_EMAIL}`);
const { data: inviteRows, error: inviteError } = await coach.rpc('create_client_invite', {
  p_email: REVIEW_EMAIL,
  p_first_name: 'App',
  p_last_name: 'Review',
  p_condition: 'Return to running, 14 weeks postpartum',
  p_goal: 'Run 5k without leaking or pain',
});
if (inviteError) throw new Error(`create_client_invite: ${inviteError.message}`);
const clientId = (Array.isArray(inviteRows) ? inviteRows[0] : inviteRows).client_id;

/**
 * The account itself, with a password.
 *
 * `createUser` rather than an invitation email, and `email_confirm` so no inbox is ever
 * needed. If the account already exists the password is reset to the supplied one, which is
 * what makes this script safe to re-run before a resubmission.
 */
console.log('→ creating the auth account with a password');
const { data: existing } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
const already = existing?.users?.find((u) => u.email === REVIEW_EMAIL);

if (already) {
  check(
    'updateUserById',
    await admin.auth.admin.updateUserById(already.id, { password: PASSWORD, email_confirm: true }),
  );
  console.log('  (existing account — password reset)');
} else {
  check(
    'createUser',
    await admin.auth.admin.createUser({ email: REVIEW_EMAIL, password: PASSWORD, email_confirm: true }),
  );
}

/**
 * Step 3, and the reason this script is also a test.
 *
 * Signing in here uses the same call the app's password screen uses. If password auth is
 * disabled on the project, or the account was made without one, this throws — and we find
 * out now rather than from a rejection.
 */
console.log('→ signing in as the reviewer, by password');
const review = createClient(URL, ANON_KEY, { auth: { persistSession: false } });
const { error: pwError } = await review.auth.signInWithPassword({
  email: REVIEW_EMAIL,
  password: PASSWORD,
});
if (pwError) throw new Error(`signInWithPassword: ${pwError.message} — the app's password screen would fail the same way`);
console.log('  password sign-in works');

console.log('→ accepting the invitation');
const { data: acceptedId, error: acceptError } = await review.rpc('accept_my_invite');
if (acceptError) throw new Error(`accept_my_invite: ${acceptError.message}`);
if (acceptedId !== clientId) throw new Error(`accept_my_invite returned ${acceptedId}, expected ${clientId}`);

console.log('→ consenting and finishing onboarding');
check(
  'record_consent',
  await review.rpc('record_consent', {
    p_types: ['health_data_processing', 'privacy', 'tos'],
    p_version: POLICY_VERSION,
  }),
);
check('mark_onboarded', await review.rpc('mark_onboarded'));

/**
 * Something to review.
 *
 * A reviewer landing on an empty Today has nothing to look at and may reject for incomplete
 * functionality, so the account arrives with a fortnight behind it: sessions kept and
 * missed, sets actually recorded, symptom scores, sleep and HRV, and meals. Recovery and
 * strain both need history to mean anything, and this is that history.
 */
console.log('→ building a fortnight of history');

const { data: exercises } = await coach.from('exercises').select('id, name').limit(6);
if (!exercises?.length) throw new Error('no exercises in the library — run the library seed first');

const sessions = [];
// Past fortnight: mostly kept, one missed, so adherence is not a suspicious 100%.
for (const [offset, done, planned] of [
  [-13, 12, 12],
  [-11, 12, 12],
  [-9, 0, 12],
  [-8, 14, 14],
  [-6, 13, 14],
  [-4, 12, 12],
  [-2, 15, 16],
]) {
  sessions.push({
    client_id: clientId,
    title: 'Lower strength',
    discipline: 'strength',
    scheduled_date: day(offset),
    status: done === 0 ? 'missed' : 'completed',
    sets_planned: planned,
    sets_done: done,
    pain_before: 2,
    pain_after: done === 0 ? null : 2,
    completed_at: done === 0 ? null : new Date().toISOString(),
  });
}
// Today, part-finished, so Start/Resume and the strain ring both have something to show.
sessions.push({
  client_id: clientId,
  title: 'Lower strength',
  discipline: 'strength',
  scheduled_date: day(0),
  status: 'in_progress',
  sets_planned: 12,
  sets_done: 5,
  pain_before: 2,
});
// And one ahead, so "Coming up" is populated.
sessions.push({
  client_id: clientId,
  title: 'Upper strength',
  discipline: 'strength',
  scheduled_date: day(2),
  status: 'scheduled',
  sets_planned: 12,
});
check('sessions', await admin.from('sessions').insert(sessions));

// Sleep and HRV, as the client's own import — the path the app uses.
const samples = [];
for (let i = 14; i >= 0; i--) {
  const d = day(-i);
  samples.push({
    type: 'sleep_min',
    value: 400 + ((i * 23) % 70),
    recordedAt: `${d}T07:00:00Z`,
    externalId: `sleep_min:${d}`,
  });
  samples.push({
    type: 'hrv_ms',
    value: 52 + ((i * 11) % 14),
    recordedAt: `${d}T07:00:00Z`,
    externalId: `hrv_ms:${d}`,
  });
  samples.push({
    type: 'resting_hr',
    value: 57 + ((i * 5) % 6),
    recordedAt: `${d}T07:00:00Z`,
    externalId: `resting_hr:${d}`,
  });
}
check('import_health_metrics', await review.rpc('import_health_metrics', { p_samples: samples }));

// A readiness read for today, so recovery has all three inputs rather than two.
check(
  'daily_reads',
  await review.from('daily_reads').insert({
    client_id: clientId,
    read_on: day(0),
    read_window: 'morning',
    readiness: 3,
    symptom: 'Nothing',
  }),
);

// Meals across three of today's four slots, so Fuel is not empty.
check(
  'food_logs',
  await review.from('food_logs').insert(
    [
      ['breakfast', 'Porridge with milk and banana', 350, 420],
      ['lunch', 'Chicken, rice and salad', 420, 610],
      ['dinner', 'Salmon, potatoes and greens', 400, 640],
    ].map(([meal, description, quantity_g, kcal]) => ({
      client_id: clientId,
      logged_on: day(0),
      meal,
      description,
      quantity_g,
      kcal,
      protein_g: Math.round(kcal * 0.075),
      carbs_g: Math.round(kcal * 0.11),
      fat_g: Math.round(kcal * 0.035),
      source: 'described',
    })),
  ),
);

console.log('');
console.log('Done. For App Store Connect → App Review Information:');
console.log(`  Sign-in required : yes`);
console.log(`  User name        : ${REVIEW_EMAIL}`);
console.log(`  Password         : (the REVIEW_PASSWORD you supplied — not printed)`);
console.log('');
console.log('On the sign-in screen the reviewer taps "Use a password" and enters both.');
