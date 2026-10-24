import { useEffect, useState } from 'react';
import { TextInput, View } from 'react-native';
import {
  listMoveRequests,
  requestSessionMove,
  withdrawMoveRequest,
  type MoveRequest,
  type ScheduledSession,
} from '@vela/api';
import { Body, Button, Card } from '@/components/kit';
import { ChoiceChips } from '@/components/scales';
import { useTheme } from '@/theme';
import { supabase } from '@/lib/supabase';
import { addDays, today } from '@/lib/data';
import { notifyCoach } from '@/lib/integrations';

const dayLabel = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });

/**
 * "Can't do this day?" — she asks, her physio decides.
 *
 * The app never moves a session on its own say-so: the request reaches the coach as a
 * decision, and the calendar changes only when she grants it. Until then the session
 * stays where it is, and the request can be taken back.
 */
export function MoveRequestCard({ session }: { session: ScheduledSession }) {
  const t = useTheme();
  const [pending, setPending] = useState<MoveRequest | null>(null);
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const now = today();
  const askable = session.status === 'scheduled' && session.scheduledDate >= now;

  useEffect(() => {
    if (!askable) return;
    void listMoveRequests(supabase, { sessionId: session.id, pending: true }).then((r) =>
      setPending(r[0] ?? null),
    );
  }, [askable, session.id]);

  if (!askable) return null;

  async function ask() {
    if (!to) return;
    setBusy(true);
    setError(null);
    const { error: e } = await requestSessionMove(supabase, session.id, to, note);
    setBusy(false);
    if (e) {
      setError('That did not send. Try again in a moment.');
      return;
    }
    void notifyCoach();
    setOpen(false);
    setPending({
      id: 'local',
      clientId: session.clientId,
      sessionId: session.id,
      fromDate: session.scheduledDate,
      toDate: to,
      note: note || null,
      status: 'pending',
      createdAt: new Date().toISOString(),
    });
  }

  async function takeBack() {
    setBusy(true);
    const { error: e } = await withdrawMoveRequest(supabase, session.id);
    setBusy(false);
    if (e) setError('Could not take it back. Try again in a moment.');
    else setPending(null);
  }

  if (pending) {
    return (
      <Card style={{ borderRadius: 22 }}>
        <Body size={14.5} weight="medium">
          You asked to move this to {dayLabel(pending.toDate)}
        </Body>
        <Body size={13} color={t.textSecondary} style={{ marginTop: 4, lineHeight: 19 }}>
          Your physio will confirm. Until then it stays on {dayLabel(session.scheduledDate)}.
        </Body>
        <View style={{ marginTop: 12 }}>
          <Button
            label={busy ? 'Taking it back…' : 'Take the request back'}
            variant="secondary"
            disabled={busy}
            onPress={() => void takeBack()}
          />
        </View>
        {error && (
          <Body size={12.5} color={t.status.critical} style={{ marginTop: 8 }}>
            {error}
          </Body>
        )}
      </Card>
    );
  }

  if (!open) {
    return (
      <Button
        label="Can't do this day? Ask to move it"
        variant="secondary"
        onPress={() => setOpen(true)}
      />
    );
  }

  const options = Array.from({ length: 8 }, (_, i) => addDays(now, i))
    .filter((d) => d !== session.scheduledDate)
    .slice(0, 7);

  return (
    <Card style={{ borderRadius: 22 }}>
      <Body size={15} weight="medium">
        Which day would work?
      </Body>
      <View style={{ marginTop: 12 }}>
        <ChoiceChips
          options={options.map((d) => ({ value: d, label: dayLabel(d) }))}
          value={to}
          onChange={setTo}
        />
      </View>
      <TextInput
        value={note}
        onChangeText={setNote}
        maxLength={200}
        placeholder="Anything your physio should know (optional)"
        placeholderTextColor={t.textMuted}
        accessibilityLabel="Note for your physio"
        style={{
          marginTop: 12,
          backgroundColor: t.inputFill,
          borderRadius: 14,
          paddingHorizontal: 14,
          paddingVertical: 10,
          fontSize: 14,
          color: t.textPrimary,
        }}
      />
      <View style={{ marginTop: 12, gap: 8 }}>
        <Button
          label={busy ? 'Sending…' : 'Ask my physio'}
          disabled={!to || busy}
          onPress={() => void ask()}
        />
        <Button label="Cancel" variant="secondary" onPress={() => setOpen(false)} />
      </View>
      {error && (
        <Body size={12.5} color={t.status.critical} style={{ marginTop: 8 }}>
          {error}
        </Body>
      )}
    </Card>
  );
}
