import { useState } from 'react';
import { Linking, Pressable, View } from 'react-native';
import type { SessionPlanItem } from '@vela/api';
import { Body } from '@/components/kit';
import { useTheme } from '@/theme';

/**
 * What her physio's library card adds to a movement on the phone: what to watch for, a
 * circuit's movements, and — behind a tap — why this one, the easier version, and the
 * clip. The dose and the cue stay on the face of the card; this is the second look.
 */
export function LeanExtras({ item }: { item: SessionPlanItem }) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  const more = !!(item.why || item.regression);
  return (
    <>
      {item.kind === 'block' && item.blockItems.length > 0 && (
        <View style={{ marginTop: 8, gap: 4 }}>
          {item.blockItems.map((b, i) => (
            <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
              <Body size={13.5} style={{ flex: 1 }}>
                {i + 1}. {b.name}
              </Body>
              {b.dose ? (
                <Body size={12.5} color={t.textSecondary}>
                  {b.dose}
                </Body>
              ) : null}
            </View>
          ))}
        </View>
      )}
      {item.watchFor ? (
        <Body size={12.5} color={t.textSecondary} style={{ marginTop: 6 }}>
          Watch for: {item.watchFor}
        </Body>
      ) : null}
      {(more || item.videoUrl) && (
        <View style={{ flexDirection: 'row', gap: 16, marginTop: 8 }}>
          {more && (
            <Pressable
              onPress={() => setOpen((v) => !v)}
              accessibilityRole="button"
              accessibilityState={{ expanded: open }}
              hitSlop={8}
            >
              <Body size={12.5} weight="medium" color={t.brand[600]}>
                {open ? 'Less' : 'Why this one'}
              </Body>
            </Pressable>
          )}
          {item.videoUrl && (
            <Pressable
              onPress={() => void Linking.openURL(item.videoUrl!)}
              accessibilityRole="link"
              hitSlop={8}
            >
              <Body size={12.5} weight="medium" color={t.brand[600]}>
                Watch the clip
              </Body>
            </Pressable>
          )}
        </View>
      )}
      {open && (
        <View style={{ marginTop: 6, gap: 4 }}>
          {item.why ? (
            <Body size={13} style={{ lineHeight: 19 }}>
              {item.why}
            </Body>
          ) : null}
          {item.regression ? (
            <Body size={12.5} color={t.textSecondary}>
              If it is too much: {item.regression}
            </Body>
          ) : null}
        </View>
      )}
    </>
  );
}
