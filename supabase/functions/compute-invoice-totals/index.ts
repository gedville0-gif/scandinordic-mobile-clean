// Supabase Edge Function — Canonical invoice total computation (audit issue #3)
//
// Closes the client-side-VAT trust gap. The client previews totals locally for
// UX, but on save it must call this function to obtain the canonical totals
// that get written to the invoices table.
//
// Contract (v1 — single VAT rate per invoice):
//   POST { line_items: [{ description, quantity, unit_price_cents }],
//          vat_rate: number }
//   →    { subtotal_cents, vat_cents, total_cents, vat_rate }
//
// All money is integer cents. `unit_price_cents` is treated as VAT-exclusive
// (net). Rounding: VAT is rounded half-away-from-zero per Finnish ALV rules.
//
// Deploy: supabase functions deploy compute-invoice-totals

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeadersFor } from '../_shared/cors.ts';

interface LineItemIn {
  description?: string;
  quantity: number;
  unit_price_cents: number;
}

interface RequestBody {
  line_items: LineItemIn[];
  vat_rate: number;
}

serve(async (req: Request) => {
  const corsHeaders = corsHeadersFor(req.headers.get('origin'));
  const json = (data: unknown, status = 200): Response =>
    new Response(JSON.stringify(data), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  // ── Authenticate the caller via their JWT.
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Missing Authorization header' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  if (!supabaseUrl || !anonKey) return json({ error: 'Server misconfigured' }, 500);

  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const {
    data: { user },
    error: authError,
  } = await authClient.auth.getUser();
  if (authError || !user) return json({ error: 'Unauthorized' }, 401);

  // ── Parse + validate body.
  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  if (!Array.isArray(body.line_items) || body.line_items.length === 0) {
    return json({ error: 'line_items must be a non-empty array' }, 400);
  }
  if (typeof body.vat_rate !== 'number' || !Number.isFinite(body.vat_rate) || body.vat_rate < 0) {
    return json({ error: 'vat_rate must be a finite non-negative number' }, 400);
  }

  // ── Compute. All math in integer cents.
  let subtotalCents = 0;
  for (const item of body.line_items) {
    const qty = Number(item.quantity);
    const price = Number(item.unit_price_cents);
    if (!Number.isFinite(qty) || !Number.isFinite(price) || !Number.isInteger(price)) {
      return json({ error: 'each line_item needs finite quantity + integer unit_price_cents' }, 400);
    }
    subtotalCents += Math.round(price * qty);
  }

  const vatCents = Math.round((subtotalCents * body.vat_rate) / 100);
  const totalCents = subtotalCents + vatCents;

  return json({
    subtotal_cents: subtotalCents,
    vat_cents: vatCents,
    total_cents: totalCents,
    vat_rate: body.vat_rate,
  });
});
