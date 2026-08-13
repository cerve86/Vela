#!/usr/bin/env node
/**
 * Rebuilds the local demo world: one client, a programme, eight weeks of vitals, and a
 * week of food logging.
 *
 * Everything is written through the real APIs as the real users — the coach creates the
 * invite, the client accepts it, consents, imports her own health samples and logs her
 * own food. Nothing here uses the service role except to mint sessions for those two
 * accounts, so every write is checked by row level security on the way in. That makes
 * this script a smoke test as well as a seed: if a policy regresses, seeding fails.
 *
 * Local only. Refuses to run against anything but the local stack.
 *
 *   node scripts/seed-demo.mjs
 */
import { createClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const ANON_KEY =
  process.env.SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

if (!/127\.0\.0\.1|localhost/.test(URL)) {
  console.error(`Refusing to seed a non-local project: ${URL}`);
  process.exit(1);
}

/** PostgREST requires a filter on delete; this one matches every row RLS already allows. */
const ZERO_UUID = '00000000-0000-0000-0000-000000000000';

const COACH_EMAIL = 'coach@vela.test';
const CLIENT_EMAIL = 'marta.rossi@client.test';
const POLICY_VERSION = '2026-08-01';

const admin = createClient(URL, SERVICE_KEY, { auth: { persistSession: false } });

/** Signs in as `email` without a password, by minting and immediately burning a link. */
async function signInAs(email) {
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

function check(label, { error }) {
  if (error) throw new Error(`${label}: ${error.message ?? error}`);
}

/** Local calendar date `n` days from today, as YYYY-MM-DD. */
function day(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Deterministic wobble in [-1, 1] from an integer, so re-seeding produces one dataset. */
function wobble(i, period = 1) {
  return Math.sin(i * period);
}

// ---------------------------------------------------------------------------

console.log('→ signing in as the coach');
const coach = await signInAs(COACH_EMAIL);

// Re-running must produce the same world, not a second copy of it. Deleting the client
// cascades to her sessions, vitals and diary; the auth account survives and is re-linked
// by the invite below, which is exactly what happens when a coach re-invites someone.
console.log('→ clearing any previous demo data');
check('clear client', await coach.from('clients').delete().eq('email', CLIENT_EMAIL));
check('clear programmes', await coach.from('programs').delete().neq('id', ZERO_UUID));
check('clear coach foods', await coach.from('foods').delete().eq('source', 'custom'));

console.log('→ inviting the client');
const { data: inviteRows, error: inviteError } = await coach.rpc('create_client_invite', {
  p_email: CLIENT_EMAIL,
  p_first_name: 'Marta',
  p_last_name: 'Rossi',
  p_condition: 'Return to running — 14 weeks postpartum',
  p_goal: 'Run 5k continuously',
  p_delivery_type: 'vaginal',
  p_weeks_postpartum: 14,
  p_breastfeeding: true,
});
if (inviteError) throw new Error(`create_client_invite: ${inviteError.message}`);
const clientId = (Array.isArray(inviteRows) ? inviteRows[0] : inviteRows).client_id;

// The six-digit code only ever proves control of the mailbox, so the seed confirms the
// address directly and then redeems the invitation through the same RPC the app calls.
// Patching `clients` as the service role would be shorter and would skip the one step
// worth exercising.
console.log('→ creating and confirming the client account');
const { error: createError } = await admin.auth.admin.createUser({
  email: CLIENT_EMAIL,
  email_confirm: true,
  user_metadata: { first_name: 'Marta', last_name: 'Rossi' },
});
if (createError && !/already been registered/i.test(createError.message)) {
  throw new Error(`createUser: ${createError.message}`);
}

const client = await signInAs(CLIENT_EMAIL);

console.log('→ accepting the invitation');
const { data: acceptedClientId, error: acceptError } = await client.rpc('accept_my_invite');
if (acceptError) throw new Error(`accept_my_invite: ${acceptError.message}`);
if (acceptedClientId !== clientId) {
  throw new Error(`accept_my_invite returned ${acceptedClientId}, expected ${clientId}`);
}

console.log('→ recording consent');
check(
  'record_consent',
  await client.rpc('record_consent', {
    p_types: ['health_data_processing', 'privacy', 'tos'],
    p_version: POLICY_VERSION,
  }),
);

// ---------------------------------------------------------------------------
// Programme
// ---------------------------------------------------------------------------

console.log('→ building the programme');
const coachId = (await coach.auth.getUser()).data.user.id;
const { data: exercises } = await coach.from('exercises').select('id, name');
const byName = new Map(exercises.map((e) => [e.name, e.id]));
const need = (name) => {
  const id = byName.get(name);
  if (!id) throw new Error(`seed expects exercise "${name}" in the library`);
  return id;
};

const { data: program, error: programError } = await coach
  .from('programs')
  .insert({
    coach_id: coachId,
    name: 'Return to running — weeks 12-18',
    description: 'Three days a week: one run, one strength, one rehab.',
    duration_weeks: 6,
    is_template: false,
  })
  .select('id')
  .single();
if (programError) throw new Error(`create program: ${programError.message}`);
const programId = program.id;

const DAYS = [
  {
    dayNo: 1,
    title: 'Walk-run intervals',
    discipline: 'run',
    items: [{ name: 'Walk-Run Intervals', block: 'A', sets: 1, reps: '20 min', rest: 0 }],
  },
  {
    dayNo: 3,
    title: 'Strength — posterior chain',
    discipline: 'strength',
    items: [
      { name: 'Romanian Deadlift', block: 'A', sets: 3, reps: '8-10', load: 32.5, rest: 90 },
      { name: 'Single-Leg Calf Raise', block: 'B', sets: 3, reps: '15', load: 10, rest: 60 },
      { name: 'Single-Leg Bridge', block: 'B', sets: 3, reps: '12', rest: 60 },
    ],
  },
  {
    dayNo: 5,
    title: 'Pelvic floor & core',
    discipline: 'rehab',
    items: [
      { name: 'Connection Breath', block: 'A', sets: 3, reps: '10', rest: 45 },
      { name: 'Dead Bug', block: 'B', sets: 3, reps: '8 each side', rest: 45 },
      { name: 'Side-Lying Hip Abduction', block: 'B', sets: 2, reps: '15 each side', rest: 45 },
    ],
  },
];

for (const d of DAYS) {
  const { data: programDay, error } = await coach
    .from('program_days')
    .insert({
      program_id: programId,
      week_no: 1,
      day_no: d.dayNo,
      title: d.title,
      discipline: d.discipline,
    })
    .select('id')
    .single();
  if (error) throw new Error(`add day(${d.title}): ${error.message}`);
  const dayId = programDay.id;

  for (const [i, item] of d.items.entries()) {
    check(
      `add item(${item.name})`,
      await coach.from('program_items').insert({
        program_day_id: dayId,
        exercise_id: need(item.name),
        order_index: i,
        block: item.block,
        sets: item.sets,
        reps: item.reps,
        target_load_kg: item.load ?? null,
        rest_sec: item.rest,
      }),
    );
  }
}

console.log('→ assigning it from last Monday');
const todayDow = new Date().getDay();
const lastMonday = day(-(todayDow === 0 ? 6 : todayDow - 1));
const { error: assignError } = await coach.rpc('assign_program', {
  p_program_id: programId,
  p_client_id: clientId,
  p_start_date: lastMonday,
});
if (assignError) throw new Error(`assign_program: ${assignError.message}`);

// ---------------------------------------------------------------------------
// Vitals — imported the way the app imports them, so the idempotency path runs
// ---------------------------------------------------------------------------

console.log('→ importing eight weeks of vitals');
const samples = [];
const push = (type, dayOffset, value) =>
  samples.push({
    type,
    value: Math.round(value * 100) / 100,
    recordedAt: new Date(`${day(-dayOffset)}T07:00:00Z`).toISOString(),
    externalId: `seed-${type}-${dayOffset}`,
  });

for (let g = 0; g <= 55; g++) {
  push('resting_hr', g, 57 - (55 - g) * 0.018 + wobble(g, 0.7) * 2.4);
  push('steps', g, 7400 + (55 - g) * 22 + wobble(g, 1.3) * 1900 + Math.cos(g * 0.45) * 900);
  if (g % 2 === 0) push('weight_kg', g, 67.4 - (55 - g) * 0.011 + wobble(g) * 0.22);
  if (g % 3 === 0) push('hrv_ms', g, 44 + (55 - g) * 0.07 + wobble(g, 0.9) * 5.5);
}

const { data: imported, error: importError } = await client.rpc('import_health_metrics', {
  p_samples: samples,
});
if (importError) throw new Error(`import_health_metrics: ${importError.message}`);

// Proving the guarantee rather than trusting it: the same payload a second time must
// insert nothing at all.
const { data: reimported } = await client.rpc('import_health_metrics', { p_samples: samples });
if (reimported !== 0) throw new Error(`re-import inserted ${reimported} rows, expected 0`);

// ---------------------------------------------------------------------------
// Nutrition
// ---------------------------------------------------------------------------

console.log('→ setting the macro target');
check(
  'nutrition target',
  await coach.from('nutrition_targets').insert({
    client_id: clientId,
    coach_id: coachId,
    effective_from: day(-30),
    kcal: 2450,
    protein_g: 125,
    carbs_g: 285,
    fat_g: 85,
    note: 'Includes roughly 400 kcal for breastfeeding. Fuel first, and eat before the run.',
  }),
);

console.log('→ adding a few coach foods');
const CUSTOM_FOODS = [
  { name: 'Porridge with whole milk', kcal: 118, p: 4.6, c: 15.2, f: 4.1, serving: '1 bowl (300 g)', g: 300 },
  { name: 'Chicken thigh, roasted', kcal: 209, p: 26, c: 0, f: 11.6, serving: '1 thigh (120 g)', g: 120 },
  { name: 'Greek yoghurt 5%', kcal: 97, p: 9, c: 3.6, f: 5, serving: '1 pot (170 g)', g: 170 },
  { name: 'Basmati rice, cooked', kcal: 130, p: 2.7, c: 28.2, f: 0.3, serving: '1 portion (200 g)', g: 200 },
  { name: 'Wholemeal bread', kcal: 247, p: 10.5, c: 41.3, f: 3.4, serving: '2 slices (80 g)', g: 80 },
  { name: 'Olive oil', kcal: 884, p: 0, c: 0, f: 100, serving: '1 tbsp (14 g)', g: 14 },
  { name: 'Banana', kcal: 89, p: 1.1, c: 22.8, f: 0.3, serving: '1 medium (120 g)', g: 120 },
];
const { data: customFoods, error: foodError } = await coach
  .from('foods')
  .insert(
    CUSTOM_FOODS.map((f) => ({
      coach_id: coachId,
      source: 'custom',
      name: f.name,
      serving_name: f.serving,
      serving_g: f.g,
      kcal_100g: f.kcal,
      protein_100g: f.p,
      carbs_100g: f.c,
      fat_100g: f.f,
    })),
  )
  .select('id, name, serving_g, kcal_100g, protein_100g, carbs_100g, fat_100g');
if (foodError) throw new Error(`custom foods: ${foodError.message}`);

console.log('→ logging the last seven days of food');
// Roughly 2,400 kcal on an average day, which is about her target — so the portal's
// "on target" count varies with the daily wobble instead of reading zero every week.
const MEALS = [
  { meal: 'breakfast', food: 'Porridge with whole milk', grams: 350 },
  { meal: 'breakfast', food: 'Banana', grams: 120 },
  { meal: 'lunch', food: 'Chicken thigh, roasted', grams: 180 },
  { meal: 'lunch', food: 'Basmati rice, cooked', grams: 380 },
  { meal: 'lunch', food: 'Olive oil', grams: 14 },
  { meal: 'dinner', food: 'Chicken thigh, roasted', grams: 150 },
  { meal: 'dinner', food: 'Wholemeal bread', grams: 110 },
  { meal: 'dinner', food: 'Olive oil', grams: 14 },
  { meal: 'snack', food: 'Greek yoghurt 5%', grams: 170 },
  { meal: 'snack', food: 'Banana', grams: 120 },
];

const rows = [];
for (let d = 6; d >= 1; d--) {
  // One day of the week deliberately left unlogged: a client who logs seven days out of
  // seven is not a client, and the portal needs to show that gap honestly.
  if (d === 4) continue;
  // Two scales, because they are different facts. The day scale is how much she ate —
  // some days are simply lighter, which is what makes "within 10% of target" a number
  // worth showing. The item wobble is only that nobody weighs food to the gram.
  const dayScale = 1 + wobble(d * 7, 1.1) * 0.16;

  for (const [i, m] of MEALS.entries()) {
    const f = customFoods.find((x) => x.name === m.food);
    const grams = Math.round(m.grams * dayScale * (1 + wobble(d * 3 + i, 0.8) * 0.08));
    const factor = grams / 100;
    rows.push({
      client_id: clientId,
      logged_on: day(-d),
      meal: m.meal,
      food_id: f.id,
      description: f.name,
      quantity_g: grams,
      kcal: Math.round(f.kcal_100g * factor * 10) / 10,
      protein_g: Math.round(f.protein_100g * factor * 10) / 10,
      carbs_g: Math.round(f.carbs_100g * factor * 10) / 10,
      fat_g: Math.round(f.fat_100g * factor * 10) / 10,
      source: 'search',
    });
  }
}
check('food logs', await client.from('food_logs').insert(rows));

// ---------------------------------------------------------------------------

const { count: sessionCount } = await coach
  .from('sessions')
  .select('id', { count: 'exact', head: true })
  .eq('client_id', clientId);
const { count: logCount } = await client
  .from('food_logs')
  .select('id', { count: 'exact', head: true });

console.log(
  [
    '',
    'Seeded:',
    `  client        ${CLIENT_EMAIL} (${clientId})`,
    `  programme     6 weeks, from ${lastMonday}`,
    `  sessions      ${sessionCount}`,
    `  vitals        ${imported} readings (re-import inserted 0, as it must)`,
    `  food logs     ${logCount} entries over 6 of the last 7 days`,
    '',
  ].join('\n'),
);
