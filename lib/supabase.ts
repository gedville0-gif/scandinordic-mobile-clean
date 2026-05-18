import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';

const SUPABASE_URL =
  process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://cuqoesrwrixjraynalej.supabase.co';

const SUPABASE_ANON_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

if (!SUPABASE_ANON_KEY) {
  console.error(
    '[supabase] EXPO_PUBLIC_SUPABASE_ANON_KEY is missing.\n' +
      'Create artifacts/scandinordic-mobile/.env with:\n' +
      '  EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key\n' +
      'The app will run in offline/local-only mode.'
  );
}

// createClient throws if key is empty — pass a dummy so the app boots.
// Auth calls will fail gracefully via the 6 s timeout in AuthContext.
const safeKey = SUPABASE_ANON_KEY || 'MISSING_KEY_SEE_CONSOLE';

const secureStorage = {
  getItem: async (key: string): Promise<string | null> => {
    try {
      return await SecureStore.getItemAsync(key);
    } catch {
      return null;
    }
  },
  setItem: async (key: string, value: string): Promise<void> => {
    try {
      await SecureStore.setItemAsync(key, value);
    } catch {}
  },
  removeItem: async (key: string): Promise<void> => {
    try {
      await SecureStore.deleteItemAsync(key);
    } catch {}
  },
};

export const supabase = createClient(SUPABASE_URL, safeKey, {
  auth: {
    storage: secureStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    // PKCE binds OAuth and password-reset flows to the device that initiated
    // them (via a code_verifier stored locally). Without PKCE, an attacker who
    // intercepts or phishes a recovery link can hijack the session on their
    // device. With PKCE, only the originating device can complete the exchange.
    flowType: 'pkce',
  },
});
