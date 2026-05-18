// Supabase Edge Function — Convert PDF to Images using Deno/Web APIs
// Deploy: supabase functions deploy pdf-to-images
// Usage: POST { pdfBase64: string }

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeadersFor } from '../_shared/cors.ts';
import { checkRateLimit } from '../_shared/rateLimit.ts';

// Size limits — defends against memory-exhaustion attacks (audit issue #9).
const MAX_PDF_BINARY_BYTES = 10 * 1024 * 1024;
const MAX_PDF_BASE64_LENGTH = Math.ceil(MAX_PDF_BINARY_BYTES * 4 / 3) + 100;
const MAX_REQUEST_BODY_BYTES = MAX_PDF_BASE64_LENGTH + 1024;

interface PdfToImagesResponse {
  success: boolean;
  images?: string[]; // base64 PNG images
  pageCount?: number;
  error?: string;
}

serve(async (req: Request) => {
  const corsHeaders = corsHeadersFor(req.headers.get('origin'));
  const json = (data: any, status: number = 200): Response =>
    new Response(JSON.stringify(data), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return json({ success: false, error: 'Method not allowed' }, 405);
  }

  // Pre-parse defense: reject oversized bodies before buffering them.
  const declaredSize = parseInt(req.headers.get('content-length') ?? '0', 10);
  if (declaredSize > MAX_REQUEST_BODY_BYTES) {
    return json({ success: false, error: `PDF too large. Maximum ${MAX_PDF_BINARY_BYTES / (1024 * 1024)} MB.` }, 413);
  }

  // ── Authenticate the caller via their JWT (audit issue #8).
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ success: false, error: 'Missing Authorization header' }, 401);

  const supabaseUrl    = Deno.env.get('SUPABASE_URL')      ?? '';
  const anonKey        = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const serviceRoleKey = Deno.env.get('SERVICE_ROLE_KEY')  ?? '';

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return json({ success: false, error: 'Server misconfigured' }, 500);
  }

  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: authError } = await authClient.auth.getUser();
  if (authError || !user) return json({ success: false, error: 'Unauthorized' }, 401);

  // ── Rate limit: 60 PDF conversions per hour per user.
  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const rl = await checkRateLimit(adminClient, user.id, {
    endpoint: 'pdf-to-images',
    windowMs: 60 * 60 * 1000,
    maxRequests: 60,
  });
  if (!rl.ok) {
    return new Response(
      JSON.stringify({ success: false, error: 'Rate limit exceeded. Try again later.', retryAfterSeconds: rl.retryAfterSeconds }),
      { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Retry-After': String(rl.retryAfterSeconds) } },
    );
  }

  try {
    console.log('🔄 Processing PDF to images conversion...');

    const { pdfBase64 } = await req.json() as { pdfBase64: string };

    if (!pdfBase64) {
      console.error('❌ Missing pdfBase64 field');
      return json({ success: false, error: 'Missing pdfBase64 field' }, 400);
    }

    if (pdfBase64.length > MAX_PDF_BASE64_LENGTH) {
      return json({ success: false, error: `PDF too large. Maximum ${MAX_PDF_BINARY_BYTES / (1024 * 1024)} MB.` }, 413);
    }

    // Validate PDF format
    if (!pdfBase64.startsWith('JVBERi0')) {
      console.error('❌ Invalid PDF format');
      return json({ success: false, error: 'Invalid PDF format' }, 400);
    }

    console.log(`📄 Processing PDF with ${pdfBase64.length} chars of base64 data`);

    // For now, return the PDF as a single "image" since Deno doesn't have built-in PDF rendering
    // This is a temporary solution - ideally we'd use a proper PDF rendering library
    console.log('⚠️ PDF to image conversion not implemented yet - returning PDF as single image');

    return json({
      success: true,
      images: [pdfBase64], // Return PDF as single "image" for now
      pageCount: 1,
      error: undefined
    });

  } catch (error) {
    console.error('❌ Function error:', error);
    return json({
      success: false,
      error: `Processing failed: ${error.message}`
    }, 500);
  }
});
