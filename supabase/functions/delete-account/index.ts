// Supabase Edge Function — Delete Account (GDPR Article 17 — Right to Erasure)
//
// Authenticates the caller via their JWT, then uses the service-role key to
// cascade-delete all of their data:
//   1. Storage objects in the `receipts` bucket referenced by their transactions
//   2. Rows in every user-owned public table
//   3. The auth.users row itself (this invalidates the JWT — client must sign out)
//
// Deploy: supabase functions deploy delete-account
//
// Required env vars (set in Supabase Dashboard → Edge Function secrets):
//   SUPABASE_URL                — auto-injected
//   SUPABASE_ANON_KEY           — auto-injected (used only to verify the caller's JWT)
//   SUPABASE_SERVICE_ROLE_KEY   — MUST be set manually; bypasses RLS for the cascade

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Tables that may contain rows owned by the user. Each is filtered by user_id
// (or `id` for profiles). Missing tables are silently skipped (42P01).
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

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST')    return json({ error: 'Method not allowed' }, 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Missing Authorization header' }, 401);

  const supabaseUrl     = Deno.env.get('SUPABASE_URL')              ?? '';
  const anonKey         = Deno.env.get('SUPABASE_ANON_KEY')         ?? '';
  const serviceRoleKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return json({ error: 'Server misconfigured' }, 500);
  }

  // ── Step 1: Identify the caller via their JWT (use anon key + their bearer token).
  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: authError } = await authClient.auth.getUser();
  if (authError || !user) return json({ error: 'Unauthorized' }, 401);

  const userId = user.id;

  // ── Step 2: Service-role client for the destructive operations.
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  // ── Step 3: Collect storage filenames before deleting transactions.
  // The receipts bucket is keyed by filename (not user_id), so the only way to
  // find a user's files is via their transactions' receipt_url field.
  const storagePathsToDelete: string[] = [];
  try {
    const { data: txs } = await adminClient
      .from('transactions')
      .select('data')
      .eq('user_id', userId);

    for (const row of (txs ?? [])) {
      const url = (row.data as { receipt_url?: unknown })?.receipt_url;
      if (typeof url === 'string') {
        const match = url.match(/\/receipts\/(.+?)(?:\?|$)/);
        if (match) storagePathsToDelete.push(match[1]);
      }
    }
  } catch (e) {
    console.log('[delete-account] collecting receipts failed:', (e as Error)?.message);
  }

  // ── Step 4: Delete storage objects. Non-fatal if it fails — we still want to
  // delete the database rows.
  if (storagePathsToDelete.length > 0) {
    try {
      const { error: storageErr } = await adminClient.storage.from('receipts').remove(storagePathsToDelete);
      if (storageErr) console.log('[delete-account] storage remove error:', storageErr.message);
    } catch (e) {
      console.log('[delete-account] storage exception:', (e as Error)?.message);
    }
  }

  // ── Step 5: Delete rows from every user-owned table. Best-effort with reporting.
  const failures: string[] = [];
  for (const tbl of USER_OWNED_TABLES) {
    try {
      const { error } = await adminClient.from(tbl.name).delete().eq(tbl.idColumn, userId);
      // 42P01 = "relation does not exist" — table not created, ignore.
      if (error && error.code !== '42P01') {
        failures.push(`${tbl.name}: ${error.message}`);
      }
    } catch (e) {
      failures.push(`${tbl.name}: ${(e as Error)?.message ?? 'unknown'}`);
    }
  }

  if (failures.length > 0) {
    // Don't delete the auth user — let the caller retry without leaving an
    // orphaned auth row pointing to deleted data.
    return json({
      error: 'Partial deletion failure — auth user NOT removed; safe to retry',
      details: failures,
    }, 500);
  }

  // ── Step 6: Delete the auth.users row. This invalidates the JWT immediately.
  const { error: deleteUserError } = await adminClient.auth.admin.deleteUser(userId);
  if (deleteUserError) {
    return json({ error: `Failed to delete auth user: ${deleteUserError.message}` }, 500);
  }

  return json({
    success: true,
    deleted: {
      tables: USER_OWNED_TABLES.map(t => t.name),
      storageFiles: storagePathsToDelete.length,
    },
  });
});

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}
