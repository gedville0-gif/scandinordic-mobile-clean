import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

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

export const supabase = createClient(SUPABASE_URL, safeKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
