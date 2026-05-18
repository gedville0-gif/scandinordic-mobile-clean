// Supabase Edge Function — Convert PDF to Images using Deno/Web APIs
// Deploy: supabase functions deploy pdf-to-images
// Usage: POST { pdfBase64: string }

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

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
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return json({ success: false, error: 'Method not allowed' }, 405);
  }

  // Pre-parse defense: reject oversized bodies before buffering them.
  const declaredSize = parseInt(req.headers.get('content-length') ?? '0', 10);
  if (declaredSize > MAX_REQUEST_BODY_BYTES) {
    return json({ success: false, error: `PDF too large. Maximum ${MAX_PDF_BINARY_BYTES / (1024 * 1024)} MB.` }, 413);
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

// JSON response helper
function json(data: any, status: number = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
  });
}