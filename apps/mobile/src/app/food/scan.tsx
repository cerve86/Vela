import { useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { cacheOffFood, foodByBarcode, isPlausibleBarcode, lookupBarcode } from '@vela/api';
import { Body, Button, Card, Display, Pill, Screen } from '@/components/kit';
import { useTheme } from '@/theme';
import { supabase } from '@/lib/supabase';

/**
 * Barcode scanning.
 *
 * The lookup order matters: our own cache first, Open Food Facts second. A product we
 * have already seen resolves with no network at all, which is the difference between
 * working in a supermarket basement and not.
 *
 * Typing the number by hand is offered beside the camera rather than hidden behind a
 * failure. Barcodes are unreadable often enough — crumpled, curved, in a dark kitchen,
 * one hand holding a baby — that making it the fallback path would be the wrong default.
 */
export default function ScanScreen() {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [permission, requestPermission] = useCameraPermissions();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState('');

  // The camera fires the same barcode many times a second. Without this the first hit
  // starts a lookup and the next fifty start fifty more.
  const handled = useRef(false);

  async function resolve(code: string) {
    if (handled.current) return;
    handled.current = true;
    setBusy(true);
    setError(null);

    try {
      const cached = await foodByBarcode(supabase, code);
      if (cached) {
        router.replace({ pathname: '/food/add', params: { foodId: cached.id, barcode: code } });
        return;
      }

      const { product, error: lookupError } = await lookupBarcode(code);
      if (lookupError) {
        setError(lookupError);
        return;
      }
      if (!product) {
        setError(
          "Open Food Facts doesn't have this one. You can still log it with just the calories.",
        );
        return;
      }

      const { food, error: cacheError } = await cacheOffFood(supabase, product);
      if (cacheError || !food) {
        setError(cacheError ?? 'Could not save that product.');
        return;
      }
      router.replace({ pathname: '/food/add', params: { foodId: food.id, barcode: code } });
    } finally {
      setBusy(false);
      // Only re-arm on failure: a success has already navigated away.
      handled.current = false;
    }
  }

  const granted = permission?.granted === true;

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{
          padding: t.space.lg,
          paddingTop: insets.top + t.space.md,
          paddingBottom: t.space.xxl,
          gap: t.space.md,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <Display size={28}>Scan a barcode</Display>

        {!granted ? (
          <Card>
            <Pill tone="neutral">Camera not enabled</Pill>
            <Body size={14} color={t.textSecondary} style={{ marginTop: t.space.md, lineHeight: 20 }}>
              Vela uses the camera only to read the barcode. Nothing is photographed, and
              no image ever leaves your phone.
            </Body>
            <View style={{ marginTop: t.space.lg }}>
              <Button
                label={permission?.canAskAgain === false ? 'Open Settings to allow' : 'Allow the camera'}
                onPress={() => requestPermission()}
              />
            </View>
          </Card>
        ) : (
          <View
            style={{
              height: 260,
              borderRadius: t.radius.lg,
              overflow: 'hidden',
              backgroundColor: '#000',
            }}
          >
            <CameraView
              style={{ flex: 1 }}
              facing="back"
              barcodeScannerSettings={{
                barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e'],
              }}
              onBarcodeScanned={({ data }) => resolve(data)}
            />
          </View>
        )}

        {busy && (
          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space.md }}>
              <ActivityIndicator color={t.brand[600]} />
              <Body size={14} color={t.textSecondary}>
                Looking it up…
              </Body>
            </View>
          </Card>
        )}

        {error && (
          <Card>
            <Body size={13} color={t.status.critical} style={{ lineHeight: 19 }}>
              {error}
            </Body>
          </Card>
        )}

        <Card title="Or type the number">
          <Body size={12} color={t.textMuted} style={{ marginBottom: t.space.md, lineHeight: 17 }}>
            The long number under the bars. Quicker than fighting a crumpled label.
          </Body>
          <View style={{ flexDirection: 'row', gap: t.space.sm }}>
            <TextInput
              value={manual}
              onChangeText={(v) => setManual(v.replace(/\D/g, ''))}
              placeholder="5000112637922"
              placeholderTextColor={t.textMuted}
              keyboardType="number-pad"
              accessibilityLabel="Barcode number"
              style={{
                flex: 1,
                backgroundColor: t.inputFill,
                borderRadius: t.radius.md,
                paddingHorizontal: 14,
                paddingVertical: 13,
                color: t.textPrimary,
                fontSize: 16,
                fontFamily: t.font.regular,
              }}
            />
            <Pressable
              onPress={() => resolve(manual)}
              disabled={!isPlausibleBarcode(manual) || busy}
              style={{
                paddingHorizontal: 18,
                justifyContent: 'center',
                borderRadius: t.radius.md,
                backgroundColor: isPlausibleBarcode(manual) ? t.brand[600] : t.softFill,
              }}
            >
              <Body
                size={14}
                weight="semibold"
                color={isPlausibleBarcode(manual) ? '#fff' : t.textMuted}
              >
                Look up
              </Body>
            </Pressable>
          </View>
        </Card>

        <Body size={11} color={t.textMuted} style={{ lineHeight: 16 }}>
          Product data comes from Open Food Facts, an open database maintained by
          volunteers. Values are as accurate as the label somebody photographed — check
          anything that looks wrong.
        </Body>

        <Button label="Back" variant="secondary" onPress={() => router.back()} />
      </ScrollView>
    </Screen>
  );
}
