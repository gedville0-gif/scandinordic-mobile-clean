// Supabase Edge Function — Resend transactional email
// Deploy: supabase functions deploy send-email
// Usage: POST { to, subject, html }
//
// Required env vars (set in Supabase Dashboard → Edge Function secrets):
//   RESEND_API_KEY  — Resend API key (https://resend.com/api-keys)
//   EMAIL_FROM      — verified sender address, e.g. "Scandinordic <noreply@scandinordic.com>"
//   SUPABASE_URL          — auto-injected
//   SUPABASE_ANON_KEY     — auto-injected (used to verify caller JWT)

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeadersFor } from '../_shared/cors.ts';

interface SendEmailRequest {
  to: string;
  subject: string;
  html: string;
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

  // Authenticate the caller — unauthenticated email senders get spam-abused.
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Missing Authorization header' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const resendKey = Deno.env.get('RESEND_API_KEY') ?? '';
  const emailFrom = Deno.env.get('EMAIL_FROM') ?? '';

  if (!supabaseUrl || !anonKey) return json({ error: 'Server misconfigured' }, 500);
  if (!resendKey || !emailFrom) return json({ error: 'Email service not configured' }, 500);

  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const {
    data: { user },
    error: authError,
  } = await authClient.auth.getUser();
  if (authError || !user) return json({ error: 'Unauthorized' }, 401);

  let body: SendEmailRequest;
  try {
    body = (await req.json()) as SendEmailRequest;
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  if (!body.to || !body.subject || !body.html) {
    return json({ error: 'Fields required: to, subject, html' }, 400);
  }

  const resendResp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: emailFrom,
      to: body.to,
      subject: body.subject,
      html: body.html,
    }),
  });

  if (!resendResp.ok) {
    const errText = await resendResp.text();
    console.error('[send-email] Resend error:', resendResp.status, errText);
    return json({ error: `Resend API error (${resendResp.status})`, details: errText }, 502);
  }

  const resendData = await resendResp.json();
  return json({ success: true, id: resendData.id });
});
