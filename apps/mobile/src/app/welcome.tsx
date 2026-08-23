import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { markOnboarded } from '@vela/api';
import { Body, Button, Screen } from '@/components/kit';
import { MilestoneBlob } from '@/components/blobs';
import { Rise } from '@/components/motion';
import { useTheme } from '@/theme';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/lib/session';
import { dismissOnboarding } from '@/lib/onboardingLocal';
import { isHealthAvailable, requestHealthAccess, syncHealth, READ_PERMISSION_LABELS } from '@/lib/health';

/**
 * The welcome flow: three screens, once.
 *
 * It runs after consent, not instead of it. Consent is Article 9 special-category
 * permission and has to be asked for separately and unbundled — folding it into a
 * swipeable introduction is precisely what makes a consent record worthless.
 *
 * So this exists to do the two things consent cannot: explain what the app is for in plain
 * words, and get Apple Health connected while somebody is still paying attention. A client
 * who never finds the Health screen has a physio working from half the picture, and the
 * only reliable moment to ask is the first one.
 *
 * Each step carries one of the three characters. They are the same components the Progress
 * milestones use, so the cast a client meets here is the cast she is rewarded by later.
 */
export default function WelcomeScreen() {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { client, refresh } = useSession();

  const [step, setStep] = useState(0);
  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * The name is dropped rather than defaulted.
   *
   * A greeting substituting a placeholder reads worse than no greeting: "Your programme,
   * there —" is what the fallback produced, and a mangled name is a louder mistake than a
   * missing one. The clause disappears instead.
   */
  const firstName = client?.email.split('@')[0]?.split('.')[0] ?? '';
  const name = firstName ? firstName.charAt(0).toUpperCase() + firstName.slice(1) : null;

  /**
   * The stamp is what the gate reads, so a failed write cannot simply be ignored — leaving
   * and letting the gate bounce her back here is the loop. On failure she stays, sees why,
   * and can either retry or wave it past for this launch.
   */
  async function finish() {
    setFinishing(true);
    setError(null);

    const { error: err } = await markOnboarded(supabase);
    if (err) {
      setError(err);
      setFinishing(false);
      return;
    }

    await refresh();
    router.replace('/');
  }

  /** Used only after a failed stamp. In memory, so the server row stays authoritative. */
  function proceedAnyway() {
    dismissOnboarding();
    router.replace('/');
  }

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: t.space.lg,
          paddingTop: insets.top + t.space.xl,
          paddingBottom: insets.bottom + t.space.xl,
          gap: 18,
          flexGrow: 1,
        }}
        showsVerticalScrollIndicator={false}
      >
        <Dots count={3} at={step} />

        {step === 0 && (
          <Step
            character="athlete"
            eyebrow="WHAT THIS IS"
            title={name ? `Your programme, ${name} —\nnot a workout app` : 'Your programme —\nnot a workout app'}
            body="Francesca builds your sessions around your goals and adjusts them as you go. Each day you get one plan: what to do, how much, and why. Nothing to design yourself."
            note="If a day is heavy or something hurts, tell the app and the session shrinks to fit. That is the point of it."
            cta="How it uses Apple Health"
            onNext={() => setStep(1)}
          />
        )}

        {step === 1 && <HealthStep onDone={() => setStep(2)} />}

        {step === 2 && (
          <Step
            character="star"
            eyebrow="THAT IS EVERYTHING"
            title={'You are set up.\nThe rest is showing up.'}
            body="Your first session is on Today. Log it as you go — every set you tick reaches Francesca, so she is never guessing between appointments."
            note="Milestones live on Progress. They are earned from what you actually do, so they will be empty for a week or so. That is normal."
            cta={finishing ? 'Opening Vela…' : error ? 'Try again' : 'Start'}
            disabled={finishing}
            onNext={() => void finish()}
            error={error}
            onBypass={error ? proceedAnyway : undefined}
          />
        )}
      </ScrollView>
    </Screen>
  );
}

/** Step two: the real permission request, and an honest way past it. */
function HealthStep({ onDone }: { onDone: () => void }) {
  const t = useTheme();
  const [available, setAvailable] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<string | null>(null);
  const [refused, setRefused] = useState(false);

  useEffect(() => {
    isHealthAvailable().then(setAvailable);
  }, []);

  async function connect() {
    setBusy(true);
    setOutcome(null);

    const { granted, error } = await requestHealthAccess();
    if (error || !granted) {
      // Not an error state. Declining is a legitimate answer, and treating it as a failure
      // to retry is how a permission prompt turns into nagging.
      setRefused(true);
      setBusy(false);
      return;
    }

    const { written, scanned, error: syncError } = await syncHealth(30);
    setBusy(false);

    if (syncError) {
      setOutcome('Connected. The first sync did not finish — Vela will try again later.');
      return;
    }
    setOutcome(
      written === 0
        ? `Connected. Nothing to import yet from ${scanned} readings.`
        : `Connected — ${written} day${written === 1 ? '' : 's'} of readings imported.`,
    );
  }

  return (
    <Rise>
      <View style={{ alignItems: 'center', paddingTop: 8 }}>
        <MilestoneBlob character="cloud" state="earned" index={0} width={132} />
      </View>

      <Body size={11} weight="medium" color={t.textSecondary} style={{ letterSpacing: 0.6, marginTop: 18 }}>
        ONE PERMISSION
      </Body>
      <Text
        style={{
          fontFamily: t.font.displaySemi,
          fontSize: 27,
          lineHeight: 32,
          letterSpacing: -0.9,
          color: t.textPrimary,
          marginTop: 6,
        }}
      >
        {'Let Vela read a few\nnumbers from Apple Health'}
      </Text>

      <Body size={14} color={t.textSecondary} style={{ marginTop: 10, lineHeight: 21 }}>
        Your resting heart rate and sleep say whether last week landed well — often before
        you feel it. Francesca uses them to decide when to push and when to hold.
      </Body>

      <View style={{ gap: 9, marginTop: 18 }}>
        {READ_PERMISSION_LABELS.map((label) => (
          <View key={label} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: t.brand[500] }} />
            <Body size={13.5}>{label}</Body>
          </View>
        ))}
      </View>

      <Body size={12} color={t.textMuted} style={{ marginTop: 16, lineHeight: 18 }}>
        Read-only — Vela never writes to Apple Health, and never reads anything not on this
        list. You can revoke it in Settings → Health → Data Access at any time.
      </Body>

      {available === false && (
        <Body size={12.5} color={t.status.warning} style={{ marginTop: 14, lineHeight: 18 }}>
          Apple Health is not available on this device. On the Simulator that is expected —
          it needs a real iPhone. You can connect later from your profile.
        </Body>
      )}

      {refused && (
        <Body size={12.5} color={t.textSecondary} style={{ marginTop: 14, lineHeight: 18 }}>
          Not connected. That is a fine answer — everything else works without it, and
          Profile has the switch when you want it.
        </Body>
      )}

      {outcome && (
        <Body size={13} style={{ marginTop: 14, color: t.status.good, lineHeight: 19 }}>
          {outcome}
        </Body>
      )}

      <View style={{ marginTop: 22, gap: 10 }}>
        {outcome ? (
          <Button label="Next" onPress={onDone} />
        ) : (
          <>
            <Button
              label={
                busy ? 'Connecting…' : available === false ? 'Apple Health unavailable' : 'Connect Apple Health'
              }
              disabled={busy || available === false}
              onPress={() => void connect()}
            />
            {busy ? (
              <ActivityIndicator color={t.brand[600]} />
            ) : (
              <Button label={refused ? 'Continue' : 'Not now'} variant="secondary" onPress={onDone} />
            )}
          </>
        )}
      </View>
    </Rise>
  );
}

/** Steps one and three: a character, a claim, and one button. */
function Step({
  character,
  eyebrow,
  title,
  body,
  note,
  cta,
  onNext,
  disabled = false,
  error,
  onBypass,
}: {
  character: 'athlete' | 'star';
  eyebrow: string;
  title: string;
  body: string;
  note: string;
  cta: string;
  onNext: () => void;
  disabled?: boolean;
  error?: string | null;
  /** Offered only when the stamp failed, so a bad write is never a locked door. */
  onBypass?: () => void;
}) {
  const t = useTheme();

  return (
    <Rise>
      <View style={{ alignItems: 'center', paddingTop: 8 }}>
        {/*
          `fresh` on the closing step so the star hops and throws motes — this is the one
          moment in onboarding that has actually been earned. The opening step drifts
          instead: nothing has happened yet, and celebrating an arrival is how an app starts
          sounding pleased with itself.
        */}
        <MilestoneBlob
          character={character}
          state={character === 'star' ? 'fresh' : 'earned'}
          index={0}
          width={140}
        />
      </View>

      <Body size={11} weight="medium" color={t.textSecondary} style={{ letterSpacing: 0.6, marginTop: 18 }}>
        {eyebrow}
      </Body>
      <Text
        style={{
          fontFamily: t.font.displaySemi,
          fontSize: 27,
          lineHeight: 32,
          letterSpacing: -0.9,
          color: t.textPrimary,
          marginTop: 6,
        }}
      >
        {title}
      </Text>

      <Body size={14} color={t.textSecondary} style={{ marginTop: 10, lineHeight: 21 }}>
        {body}
      </Body>

      <View
        style={{
          marginTop: 18,
          backgroundColor: t.softFill,
          borderRadius: t.radius.md,
          paddingVertical: 14,
          paddingHorizontal: 15,
        }}
      >
        <Body size={12.5} color={t.textSecondary} style={{ lineHeight: 18 }}>
          {note}
        </Body>
      </View>

      {error && (
        <Body size={12.5} color={t.status.critical} style={{ marginTop: 14, lineHeight: 18 }}>
          Could not save that you have seen this — {error}
        </Body>
      )}

      <View style={{ marginTop: 22, gap: 10 }}>
        <Button label={cta} disabled={disabled} onPress={onNext} />
        {onBypass ? (
          <Button label="Skip and open Vela" variant="secondary" onPress={onBypass} />
        ) : null}
      </View>
    </Rise>
  );
}

/** Where you are in three. No back button — there is nothing behind step one. */
function Dots({ count, at }: { count: number; at: number }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 6, justifyContent: 'center' }}>
      {Array.from({ length: count }, (_, i) => (
        <View
          key={i}
          style={{
            height: 5,
            width: i === at ? 22 : 5,
            borderRadius: 3,
            backgroundColor: i === at ? t.brand[600] : t.grid,
          }}
        />
      ))}
    </View>
  );
}
