import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createVelaClient } from '@vela/api';

/**
 * The app's Supabase client.
 *
 * detectSessionInUrl is false: on a phone there is no URL fragment to read, and the
 * deep-link handler exchanges tokens explicitly instead. Leaving it on makes the client
 * race the router for the same one-time token.
 */
export const supabase = createVelaClient({
  url: process.env.EXPO_PUBLIC_SUPABASE_URL!,
  anonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
  storage: AsyncStorage,
  detectSessionInUrl: false,
});
