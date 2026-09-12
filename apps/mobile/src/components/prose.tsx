import { View } from 'react-native';
import { Body } from '@/components/kit';
import { useTheme } from '@/theme';

/**
 * Plain text from the physiotherapist, laid out by the shape of its lines alone.
 *
 * Blank lines make paragraphs, a line starting with a number or a dash is a list item, a
 * short line on its own that ends in a colon or is all capitals is a heading. Nothing is
 * interpreted beyond that — the text is the prescription and it is hers.
 */
export type TextBlock =
  | { kind: 'heading'; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'list'; items: { marker: string; text: string }[] };

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

/** The text, in a card. */
export function Prose({ body }: { body: string }) {
  const t = useTheme();
  return (
    <View
      style={{
        backgroundColor: t.surface,
        borderRadius: 22,
        paddingVertical: 20,
        paddingHorizontal: 18,
        gap: 10,
      }}
    >
      {blocks(body).map((b, i) => (
        <Block key={i} block={b} />
      ))}
    </View>
  );
}

function Block({ block }: { block: TextBlock }) {
  const t = useTheme();
  if (block.kind === 'heading') {
    return (
      <View accessibilityRole="header">
        <Body
          size={12}
          weight="bold"
          color={t.textMuted}
          style={{ letterSpacing: 0.6, marginTop: 6 }}
        >
          {block.text.toUpperCase()}
        </Body>
      </View>
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
