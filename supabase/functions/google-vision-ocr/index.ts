// Supabase Edge Function — google-vision-ocr
// Deploy: supabase functions deploy google-vision-ocr
// Secret:  supabase secrets set GOOGLE_VISION_API_KEY=<your-key>

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const GOOGLE_API_KEY = Deno.env.get('GOOGLE_VISION_API_KEY') ?? '';
const VISION_URL = `https://vision.googleapis.com/v1/images:annotate?key=${GOOGLE_API_KEY}`;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  // Preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    const { image } = await req.json() as { image: string };

    if (!image) {
      return json({ error: 'Missing image field' }, 400);
    }
    if (!GOOGLE_API_KEY) {
      return json({ error: 'GOOGLE_VISION_API_KEY secret not set' }, 500);
    }

    // ── Call Google Vision TEXT_DETECTION ──────────────────────────────────
    const visionRes = await fetch(VISION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [{
          image: { content: image },
          features: [{ type: 'TEXT_DETECTION', maxResults: 1 }],
        }],
      }),
    });

    if (!visionRes.ok) {
      const err = await visionRes.text();
      return json({ error: `Vision API error: ${err}` }, 502);
    }

    const visionData = await visionRes.json();
    const rawText: string =
      visionData?.responses?.[0]?.fullTextAnnotation?.text ?? '';

    if (!rawText) {
      return json({
        merchant: '', net_amount: null, vat_rate: null,
        date: null, category: 'other', confidence: 0,
      });
    }

    // ── Parse receipt text → structured fields ─────────────────────────────
    const result = parseReceiptText(rawText);
    return json(result);

  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});

// ── JSON helper ────────────────────────────────────────────────────────────────

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

// ── Receipt text parser ────────────────────────────────────────────────────────

interface ParsedReceipt {
  merchant: string;
  net_amount: number | null;
  vat_rate: number | null;
  date: string | null;
  category: string;
  confidence: number;
}

function parseReceiptText(text: string): ParsedReceipt {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  let confidence = 0;

  // ── MYYJÄ / Merchant ──────────────────────────────────────────────────────
  // First meaningful line is usually the store name
  const merchant = lines[0] ?? '';
  if (merchant.length > 1) confidence += 0.3;

  // ── NETTOSUMMA / Net amount ───────────────────────────────────────────────
  let net_amount: number | null = null;

  const netPatterns: RegExp[] = [
    /veroton[:\s]+(\d[\d\s,.]+)/i,          // "Veroton 12,50"
    /netto[:\s]+(\d[\d\s,.]+)/i,             // "Netto 12,50"
    /yhteens[aä][:\s]+(\d[\d\s,.]+)/i,       // "Yhteensä 15,20"
    /total[:\s]+(\d[\d\s,.]+)/i,
    /summa[:\s]+(\d[\d\s,.]+)/i,
  ];

  for (const pat of netPatterns) {
    const m = text.match(pat);
    if (m) {
      const parsed = parseFinAmount(m[1]);
      if (parsed !== null) { net_amount = parsed; confidence += 0.25; break; }
    }
  }

  // Fallback: largest currency amount on the page
  if (net_amount === null) {
    const amounts = [...text.matchAll(/(\d{1,5}[,.]\d{2})\s*(?:€|eur)?/gi)]
      .map(m => parseFinAmount(m[1]))
      .filter((v): v is number => v !== null);
    if (amounts.length) {
      net_amount = Math.max(...amounts);
      confidence += 0.1;
    }
  }

  // ── VAT / ALV ─────────────────────────────────────────────────────────────
  let vat_rate: number | null = null;

  const vatMatch =
    text.match(/alv\s+(\d+[,.]\d+|\d+)\s*%/i) ??
    text.match(/vat\s+(\d+[,.]\d+|\d+)\s*%/i) ??
    text.match(/(\d+[,.]\d+|\d+)\s*%\s*alv/i) ??
    text.match(/(?:vat|alv)[^%\d]*(\d+[,.]\d+|\d+)/i);

  if (vatMatch) {
    const v = parseFloat(vatMatch[1].replace(',', '.'));
    if (!isNaN(v) && v <= 100) { vat_rate = v; confidence += 0.2; }
  }

  // Default Finnish standard VAT if not found
  if (vat_rate === null) vat_rate = 25.5;

  // ── PÄIVÄMÄÄRÄ / Date ─────────────────────────────────────────────────────
  let date: string | null = null;

  const dateMatch =
    text.match(/(\d{1,2})[.\-\/](\d{1,2})[.\-\/](\d{2,4})/) ??
    text.match(/(\d{4})[.\-](\d{2})[.\-](\d{2})/);

  if (dateMatch) {
    const raw = dateMatch[0];
    if (/^\d{4}/.test(raw)) {
      // Already YYYY-MM-DD
      date = raw.replace(/[.\-\/]/g, '-').slice(0, 10);
    } else {
      // DD.MM.YYYY or DD.MM.YY
      const [d, mo, y] = raw.split(/[.\-\/]/);
      const year = y.length === 2 ? `20${y}` : y;
      date = `${year}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
    confidence += 0.15;
  }

  // ── KATEGORIA / Category ──────────────────────────────────────────────────
  const category = detectCategory(merchant + ' ' + text);
  if (category !== 'other') confidence += 0.1;

  return {
    merchant,
    net_amount,
    vat_rate,
    date,
    category,
    confidence: Math.min(Math.round(confidence * 100) / 100, 1),
  };
}

// Parse Finnish number format: "12,50" or "12.50" or "1 234,50"
function parseFinAmount(raw: string): number | null {
  const cleaned = raw.replace(/\s/g, '').replace(',', '.');
  const v = parseFloat(cleaned);
  return isNaN(v) ? null : v;
}

// ── Category detection from merchant name + full text ─────────────────────────

function detectCategory(text: string): string {
  const t = text.toLowerCase();

  if (/k-market|s-market|lidl|prisma|alepa|siwa|valintatalo|foodie|tokmanni|aldi|maximarket/.test(t))
    return 'groceries';
  if (/shell|neste|abc\s|st1|teboil|fuel|bensa|diesel|öljy/.test(t))
    return 'fuel';
  if (/bauhaus|k-rauta|biltema|rautakesko|byggmakker|timber|lumber/.test(t))
    return 'materials';
  if (/elisa|dna|telia|tele2|mobiili|telecom|teliasonera/.test(t))
    return 'phone';
  if (/ravintola|restaurant|café|cafe|kahvila|mcdonalds|hesburger|subway|pizza|burger/.test(t))
    return 'meals';
  if (/hotelli|hotel|airbnb|booking\.com|sokos/.test(t))
    return 'accommodation';
  if (/amazon|verkkokauppa|gigantti|power|jimms|cdon|elektronik/.test(t))
    return 'equipment';
  if (/apteekki|pharmacy|boots|yliopiston apteekki/.test(t))
    return 'health';
  if (/kesko|rimi|euro[- ]?spar|spar/.test(t))
    return 'groceries';

  return 'other';
}
