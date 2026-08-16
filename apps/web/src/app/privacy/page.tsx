import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy policy — Vela',
  description: 'What Vela records, why, and how to get it deleted.',
};

/**
 * The privacy policy, served publicly.
 *
 * App Store Connect requires a reachable URL before a build can go to external TestFlight,
 * and an app that reads HealthKit gets this read rather than skimmed. It sits outside the
 * (dash) route group on purpose: it must load with no session.
 *
 * DRAFT. The controller identity, contact address and retention period are the operator's
 * to set, and are marked below. This is a starting point written against what the software
 * actually does — it is not legal advice, and it should be reviewed before launch.
 */

const UPDATED = '16 August 2026';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="mt-2 space-y-3 text-sm leading-relaxed ink-2">{children}</div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-3xl font-extrabold tracking-tight">Privacy policy</h1>
      <p className="mt-2 text-sm ink-3">Last updated {UPDATED}</p>

      <p className="mt-6 text-sm leading-relaxed ink-2">
        Vela is used by a physiotherapist and the clients she works with. It records
        training, symptoms and health measurements so that the two of you can see how
        recovery is going between appointments. This page explains what is stored, why, and
        how to have it removed.
      </p>

      <div
        className="mt-6 rounded-xl p-4 text-sm"
        style={{ background: 'var(--tint-peach)', color: 'var(--ink-primary)' }}
      >
        <strong>Operator to complete before launch:</strong> the data controller&apos;s
        registered name, address and contact email, the retention period in &ldquo;How long
        it is kept&rdquo;, and — if any client is in the UK or the EU — the transfer
        mechanism relied on for storing their data in Singapore.
      </div>

      <Section title="Who controls your data">
        <p>
          The data controller is your physiotherapist&apos;s practice —{' '}
          <em>[registered practice name and address]</em>. Questions, requests for a copy of
          your data, or a request to delete it can go to <em>[contact email]</em>.
        </p>
        <p>
          Vela is the software the practice uses. It is not a medical device, it does not
          diagnose, and it does not replace clinical judgement.
        </p>
      </Section>

      <Section title="What is recorded">
        <p>
          <strong>Account.</strong> Your email address, and your first and last name as your
          physiotherapist entered them.
        </p>
        <p>
          <strong>Training.</strong> The programme assigned to you, which sessions you
          completed or skipped, and the pain or symptom score you give before and after each
          one.
        </p>
        <p>
          <strong>Health measurements.</strong> Body weight, body fat percentage, resting
          heart rate, heart rate variability, steps and VO₂ max. These come either from
          Apple Health, if you connect it, or from what you or your physiotherapist enter by
          hand. Every reading is stored with its origin, so an imported figure is never
          mistaken for one you typed.
        </p>
        <p>
          <strong>Food.</strong> What you log, when, and the energy and macronutrients of
          each entry.
        </p>
        <p>
          <strong>Postpartum context.</strong> Weeks postpartum, delivery type and whether
          you are breastfeeding, where your physiotherapist has recorded them — these change
          what the app recommends and how targets are set.
        </p>
      </Section>

      <Section title="Apple Health">
        <p>
          Connecting Apple Health is optional and the app works without it. Vela reads only
          the six measurements listed above, and only after you grant access on Apple&apos;s
          own permission screen. It never writes to Apple Health.
        </p>
        <p>
          Health data read from Apple Health is used solely to show you and your
          physiotherapist how training is landing. In line with Apple&apos;s requirements it
          is never used for advertising or marketing, never sold, and never shared with data
          brokers or third parties for their own purposes.
        </p>
        <p>
          You can withdraw access at any time in Settings → Health → Data Access &amp;
          Devices, which stops any further reading. Readings already imported stay until you
          delete your data.
        </p>
      </Section>

      <Section title="Why it is allowed to be stored">
        <p>
          Most of this is health data, which data protection law treats as more sensitive
          than ordinary personal data. Vela relies on your <strong>explicit consent</strong>.
          You give it in the app the first time you sign in, each type separately, and the
          record of it — what you agreed to, which version, and when — is stored alongside
          your account.
        </p>
        <p>
          Under Singapore&apos;s Personal Data Protection Act that consent is the basis for
          collecting, using and disclosing your data. If you are in the UK or the EU, the
          equivalent basis is explicit consent under Article 9(2)(a) UK GDPR/GDPR, and your
          data being stored in Singapore is an international transfer —{' '}
          <em>[the practice should confirm the transfer mechanism it relies on before
          accepting clients in those regions]</em>.
        </p>
        <p>
          Consent can be withdrawn at any time from your profile. Withdrawing it stops
          further processing; it does not undo what was lawfully processed beforehand.
        </p>
      </Section>

      <Section title="Who can see it">
        <p>
          Your physiotherapist, and nobody else. Clients cannot see one another, and a
          physiotherapist can only see the clients they invited. This is enforced by the
          database itself rather than by the app, and it is covered by an automated test
          suite that runs on every change.
        </p>
        <p>
          Your food diary is readable by your physiotherapist but cannot be edited by her —
          what you logged stays your account of your own day.
        </p>
      </Section>

      <Section title="Where it is stored">
        <p>
          On Supabase infrastructure in Singapore, encrypted in transit and at rest. Vela
          does not use advertising networks, and does not sell or share personal data.
        </p>
      </Section>

      <Section title="How long it is kept">
        <p>
          For as long as you are a client of the practice, and afterwards for{' '}
          <em>[retention period — set this to match the practice&apos;s clinical records
          policy]</em>, after which it is deleted.
        </p>
      </Section>

      <Section title="Your rights">
        <p>
          You can ask for a copy of everything held about you, ask for corrections, withdraw
          consent, or ask for it all to be deleted. The app has both a one-tap data export
          and account deletion in your profile — deletion is immediate and permanent, and it
          removes your sessions, measurements, food diary and consent records.
        </p>
        <p>
          You also have the right to complain to your data protection authority — in
          Singapore the Personal Data Protection Commission, or in the UK the Information
          Commissioner&apos;s Office.
        </p>
      </Section>

      <Section title="Changes">
        <p>
          If what we record or why it changes, this page is updated and the app asks you to
          review your consent again rather than assuming the old one still covers it.
        </p>
      </Section>
    </main>
  );
}
