// Supabase Edge Function — Export My Data (GDPR Article 20 — Right to Data Portability)
//
// Authenticates the caller via their JWT, then reads every user-owned row across
// all tables and returns one structured JSON payload. The client saves the
// payload to a file and shares/downloads it.
//
// Deploy: supabase functions deploy export-data
//
// Required env vars (set in Supabase Dashboard → Edge Function secrets):
//   SUPABASE_URL       — auto-injected
//   SUPABASE_ANON_KEY  — auto-injected (used only to verify caller JWT)
//   SERVICE_ROLE_KEY   — MUST be set manually; allows reading all the user's
//                        data regardless of RLS. Supabase blocks secret names
//                        starting with SUPABASE_, so the conventional
//                        `SUPABASE_SERVICE_ROLE_KEY` cannot be used here —
//                        store the service-role key under this unprefixed name.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const USER_OWNED_TABLES: Array<{ name: string; idColumn: string }> = [
  { name: 'transactions',     idColumn: 'user_id' },
  { name: 'invoices',         idColumn: 'user_id' },
  { name: 'workers',          idColumn: 'user_id' },
  { name: 'work_sessions',    idColumn: 'user_id' },
  { name: 'team_payroll',     idColumn: 'user_id' },
  { name: 'mileage_journeys', idColumn: 'user_id' },
  { name: 'tax_payments',     idColumn: 'user_id' },
  { name: 'profiles',         idColumn: 'id' },
];

interface ExportPayload {
  exported_at: string;
  format_version: 1;
  user: {
    id: string;
    email: string | null;
    created_at: string | null;
  };
  data: Record<string, unknown[]>;
  notes: string[];
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST')    return json({ error: 'Method not allowed' }, 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Missing Authorization header' }, 401);

  const supabaseUrl    = Deno.env.get('SUPABASE_URL')              ?? '';
  const anonKey        = Deno.env.get('SUPABASE_ANON_KEY')         ?? '';
  const serviceRoleKey = Deno.env.get('SERVICE_ROLE_KEY') ?? '';

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return json({ error: 'Server misconfigured' }, 500);
  }

  // ── Identify the caller via their JWT.
  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: authError } = await authClient.auth.getUser();
  if (authError || !user) return json({ error: 'Unauthorized' }, 401);

  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  // ── Build the export payload.
  const payload: ExportPayload = {
    exported_at: new Date().toISOString(),
    format_version: 1,
    user: {
      id: user.id,
      email: user.email ?? null,
      created_at: user.created_at ?? null,
    },
    data: {},
    notes: [
      'This file contains all data Scandinordic Pro holds about your account at the time of export.',
      'Money fields are stored as integer cents (1 cent = €0.01).',
      'Device-only data (UI settings, onboarding profile) lives in your phone\'s storage and is not part of this server export.',
    ],
  };

  const tableErrors: string[] = [];
  for (const tbl of USER_OWNED_TABLES) {
    try {
      const { data, error } = await adminClient
        .from(tbl.name)
        .select('*')
        .eq(tbl.idColumn, user.id);
      if (error && error.code !== '42P01') {
        tableErrors.push(`${tbl.name}: ${error.message}`);
        payload.data[tbl.name] = [];
      } else {
        payload.data[tbl.name] = data ?? [];
      }
    } catch (e) {
      tableErrors.push(`${tbl.name}: ${(e as Error)?.message ?? 'unknown'}`);
      payload.data[tbl.name] = [];
    }
  }

  if (tableErrors.length > 0) {
    payload.notes.push(`Partial export — the following tables could not be fully read: ${tableErrors.join('; ')}`);
  }

  return json(payload);
});

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}
