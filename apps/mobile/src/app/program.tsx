import { useRouter } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft } from 'lucide-react-native';
import { Body, Screen } from '@/components/kit';
import { useTheme } from '@/theme';
import { useAssignedProgram } from '@/lib/data';

/**
 * A written programme, read through.
 *
 * The physiotherapist wrote what to do as prose and this shows it as she wrote it: blank
 * lines make paragraphs, a line starting with a number or a dash is a list item, a line
 * that ends in a colon or stands alone in capitals is a heading. Nothing is interpreted
 * beyond that — the text is the prescription and it is hers.
 */
export default function ProgramScreen() {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const assigned = useAssignedProgram();
  const program = assigned.data;

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: t.space.lg,
          paddingTop: insets.top + t.space.md,
          paddingBottom: t.space.xxl * 2,
          gap: 14,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
        >
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Back to Today"
            style={({ pressed }) => ({
              width: 34,
              height: 34,
              borderRadius: 17,
              backgroundColor: t.surface,
              borderWidth: 1,
              borderColor: t.border,
              alignItems: 'center',
              justifyContent: 'center',
              transform: [{ scale: pressed ? 0.965 : 1 }],
            })}
          >
            <ChevronLeft size={16} color={t.textPrimary} strokeWidth={2.5} />
          </Pressable>
          {program ? (
            <Body size={12.5} weight="medium" color={t.textSecondary}>
              {program.durationWeeks} weeks · from {friendly(program.startDate)}
            </Body>
          ) : null}
        </View>

        {program?.kind === 'descriptive' && program.body ? (
          <>
            <Text
              style={{
                fontFamily: t.font.displaySemi,
                fontSize: 30,
                letterSpacing: -1,
                lineHeight: 34,
                color: t.textPrimary,
                marginTop: 6,
              }}
            >
              {program.name}
            </Text>
            {program.description ? (
              <Body size={13.5} color={t.textSecondary} style={{ marginTop: -6 }}>
                {program.description}
              </Body>
            ) : null}
            <View
              style={{
                backgroundColor: t.surface,
                borderRadius: 22,
                paddingVertical: 20,
                paddingHorizontal: 18,
                gap: 10,
                marginTop: 4,
              }}
            >
              {blocks(program.body).map((b, i) => (
                <Block key={i} block={b} />
              ))}
            </View>
            <Body size={12.5} color={t.textMuted} style={{ textAlign: 'center', marginTop: 8 }}>
              Written by your physio. If anything is unclear, or feels heavy or dragging, tell her
              in Messages.
            </Body>
          </>
        ) : (
          <Body size={14} color={t.textSecondary} style={{ marginTop: 12 }}>
            {assigned.loading ? 'Loading…' : 'No written programme at the moment.'}
          </Body>
        )}
      </ScrollView>
    </Screen>
  );
}

type TextBlock =
  | { kind: 'heading'; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'list'; items: { marker: string; text: string }[] };

/** Plain text into paragraphs, lists and headings, by the shape of the lines alone. */
export function blocks(body: string): TextBlock[] {
  const out: TextBlock[] = [];
  const paragraphs = body
    .replace(/\r\n?/g, '\n')
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  for (const p of paragraphs) {
    const lines = p
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    const listy = lines.map((l) => /^(\d+[.)]|[-–•*])\s+/.exec(l));
    if (lines.length > 0 && listy.every(Boolean)) {
      out.push({
        kind: 'list',
        items: lines.map((l, i) => {
          const m = listy[i]!;
          const marker = /^\d/.test(m[1]!) ? m[1]!.replace(')', '.') : '•';
          return { marker, text: l.slice(m[0].length) };
        }),
      });
      continue;
    }
    // A short line on its own that ends in a colon, or is all capitals, reads as a heading.
    if (
      lines.length === 1 &&
      lines[0]!.length <= 60 &&
      (/:$/.test(lines[0]!) || (lines[0]! === lines[0]!.toUpperCase() && /[A-Z]/.test(lines[0]!)))
    ) {
      out.push({ kind: 'heading', text: lines[0]!.replace(/:$/, '') });
      continue;
    }
    // Lines that are not a list keep their breaks: "Mon — run / Wed — strength" is a
    // schedule, not a paragraph to reflow.
    out.push({ kind: 'paragraph', text: lines.join('\n') });
  }
  return out;
}

function Block({ block }: { block: TextBlock }) {
  const t = useTheme();
  if (block.kind === 'heading') {
    return (
      <Body
        size={12}
        weight="bold"
        color={t.textMuted}
        style={{ letterSpacing: 0.6, marginTop: 6 }}
      >
        {block.text.toUpperCase()}
      </Body>
    );
  }
  if (block.kind === 'list') {
    return (
      <View style={{ gap: 6 }}>
        {block.items.map((it, i) => (
          <View key={i} style={{ flexDirection: 'row', gap: 10 }}>
            <Body
              size={15}
              weight="medium"
              color={t.brand[600]}
              style={{ width: 22, textAlign: 'right' }}
            >
              {it.marker}
            </Body>
            <Body size={15} style={{ flex: 1, lineHeight: 22 }}>
              {it.text}
            </Body>
          </View>
        ))}
      </View>
    );
  }
  return (
    <Body size={15} style={{ lineHeight: 22 }}>
      {block.text}
    </Body>
  );
}

function friendly(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
  });
}
