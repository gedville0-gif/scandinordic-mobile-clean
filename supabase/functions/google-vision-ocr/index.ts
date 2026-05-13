// Supabase Edge Function — Google Vision OCR for Finnish Bank Statements
// Deploy: supabase functions deploy google-vision-ocr
// Usage: POST { image: base64_pdf_string, type: 'bank_statement' }

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const GOOGLE_API_KEY = Deno.env.get('GOOGLE_VISION_API_KEY') ?? '';
const VISION_URL = `https://vision.googleapis.com/v1/images:annotate?key=${GOOGLE_API_KEY}`;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

interface Transaction {
  date: string;        // YYYY-MM-DD
  description: string; // merchant name
  amount: number;      // signed float, negative = expense
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  try {
    console.log('🔄 Processing PDF with Google Vision...');

    const { image, type = 'bank_statement' } = await req.json() as {
      image: string;
      type?: string
    };

    // Validate inputs
    if (!image) {
      console.error('❌ Missing image field');
      return json({ error: 'Missing image field' }, 400);
    }

    if (!GOOGLE_API_KEY) {
      console.error('❌ GOOGLE_VISION_API_KEY not configured');
      return json({ error: 'Google Vision API key not configured' }, 500);
    }

    console.log(`📄 Processing ${type} with ${image.length} chars of base64 data`);

    // Detect image format
    let mimeType = 'image/png'; // default
    if (image.startsWith('JVBERi0')) {
      console.log('❌ PDF format detected - PDF files are not supported. Please send PNG/JPEG images.');
      return json({
        success: false,
        transactions: [],
        rawText: '',
        error: 'PDF format not supported - requires image conversion',
        suggestion: 'Convert PDF to images first'
      });
    } else if (image.startsWith('/9j/')) {
      mimeType = 'image/jpeg';
      console.log('📸 Detected JPEG image format');
    } else if (image.startsWith('iVBORw0')) {
      mimeType = 'image/png';
      console.log('📸 Detected PNG image format');
    } else {
      console.log('📸 Assuming PNG format for unknown signature');
    }

    // Call Google Vision Images API for image processing
    const visionResponse = await fetch(VISION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [{
          image: {
            content: image
          },
          features: [
            { type: 'TEXT_DETECTION', maxResults: 10 },
            { type: 'DOCUMENT_TEXT_DETECTION', maxResults: 1 }
          ]
        }]
      })
    });

    if (!visionResponse.ok) {
      const errorText = await visionResponse.text();
      console.error('❌ Vision API error:', visionResponse.status, errorText);
      return json({ error: `Vision API error (${visionResponse.status}): ${errorText}` }, 502);
    }

    const visionData = await visionResponse.json();
    console.log('✅ Vision API response received');
    console.log('📊 Response structure:', {
      hasResponses: !!visionData.responses,
      responseCount: visionData.responses?.length || 0,
      hasFullText: !!visionData.responses?.[0]?.fullTextAnnotation,
      hasTextAnnotations: !!visionData.responses?.[0]?.textAnnotations,
      textAnnotationCount: visionData.responses?.[0]?.textAnnotations?.length || 0,
      hasError: !!visionData.responses?.[0]?.error
    });

    // Log any Vision API errors
    if (visionData.responses?.[0]?.error) {
      const error = visionData.responses[0].error;
      console.error('❌ Vision API processing error:', error);

      return json({
        success: false,
        transactions: [],
        rawText: '',
        error: `Vision API error: ${error.message || 'Unknown error'}`
      });
    }

    // Extract text using multiple methods
    const response = visionData?.responses?.[0];
    let fullText = response?.fullTextAnnotation?.text ?? '';

    // Try TEXT_DETECTION if DOCUMENT_TEXT_DETECTION failed
    if (!fullText && response?.textAnnotations?.length > 0) {
      fullText = response.textAnnotations
        .map((annotation: any) => annotation.description)
        .join(' ');
      console.log('📝 Used TEXT_DETECTION fallback');
    }

    if (!fullText || fullText.trim().length === 0) {
      console.error('❌ No text extracted from document using any method');
      console.error('📊 Vision response structure:', JSON.stringify(visionData, null, 2));

      return json({
        success: false,
        transactions: [],
        rawText: '',
        error: 'No text found in document'
      });
    }

    console.log(`📝 Extracted ${fullText.length} characters of text`);
    console.log(`📝 First 200 chars: "${fullText.substring(0, 200)}"`);

    // Parse transactions from extracted text
    const transactions = parseTransactions(fullText);
    console.log(`💰 Parsed ${transactions.length} transactions`);

    // Parse Finnish ALV breakdown table
    const vatBreakdown = parseAlvBreakdown(fullText);
    console.log(`💶 ALV breakdown: ${vatBreakdown.length} rows`, JSON.stringify(vatBreakdown));

    // Return success response
    return json({
      success: true,
      transactions,
      rawText: fullText,
      vatBreakdown,
      debug_text_length: fullText.length,
      debug_first_500: fullText.substring(0, 500)
    });

  } catch (error) {
    console.error('❌ Function error:', error);
    return json({
      success: false,
      transactions: [],
      rawText: '',
      error: `Processing failed: ${error.message}`
    }, 500);
  }
});

// Parse Finnish bank statement text into transactions
function parseTransactions(text: string): Transaction[] {
  console.log('🔍 Parsing transactions from text...');

  const transactions: Transaction[] = [];
  const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // OP Bank format: "2 Mar 2026 -556.66 BANK TRANSFER"
    const opMatch = line.match(/(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{4})\s+([-+]?\d+[.,]\d{2})/i);
    if (opMatch) {
      const transaction = parseOPTransaction(opMatch, line, lines, i);
      if (transaction) {
        transactions.push(transaction);
        console.log(`✅ OP: ${transaction.date} | ${transaction.description} | ${transaction.amount}`);
      }
      continue;
    }

    // Nordea format: "DD.MM description amount"
    const nordeaMatch = line.match(/^(\d{1,2})\.(\d{1,2})\s+(.+?)\s+([-+]?\d+[.,]\d{2})$/);
    if (nordeaMatch) {
      const transaction = parseNordeaTransaction(nordeaMatch, line);
      if (transaction) {
        transactions.push(transaction);
        console.log(`✅ Nordea: ${transaction.date} | ${transaction.description} | ${transaction.amount}`);
      }
      continue;
    }
  }

  return transactions;
}

// Parse OP Bank transaction
function parseOPTransaction(match: RegExpMatchArray, line: string, lines: string[], index: number): Transaction | null {
  try {
    const day = match[1].padStart(2, '0');
    const month = getMonthNumber(match[2]);
    const year = match[3];
    const amountStr = match[4].replace(',', '.');

    const date = `${year}-${month}-${day}`;
    const amount = parseFloat(amountStr);

    // Extract description (look for vendor name in current or next lines)
    let description = line.replace(match[0], '').trim();

    // If description is just payment method, look at next lines for vendor
    if (description.match(/^(BANK TRANSFER|CARD PAYMENT|PAYMENT SERVICE)$/i)) {
      for (let j = index + 1; j < Math.min(index + 3, lines.length); j++) {
        const nextLine = lines[j];
        if (nextLine && !nextLine.match(/^\d/) && !nextLine.match(/^(MESSAGE|SEPA|Reference)/i)) {
          description = nextLine.trim();
          break;
        }
      }
    }

    // Clean up description
    description = description.replace(/^(BANK TRANSFER|CARD PAYMENT|PAYMENT SERVICE)\s*/i, '').trim();
    if (!description || description.length < 2) {
      description = 'Unknown Transaction';
    }

    return { date, description, amount };
  } catch (error) {
    console.warn('⚠️ Failed to parse OP transaction:', error);
    return null;
  }
}

// Parse Nordea transaction
function parseNordeaTransaction(match: RegExpMatchArray, line: string): Transaction | null {
  try {
    const day = match[1].padStart(2, '0');
    const month = match[2].padStart(2, '0');
    const year = new Date().getFullYear().toString(); // Current year
    const description = match[3].trim();
    const amountStr = match[4].replace(',', '.');

    const date = `${year}-${month}-${day}`;
    const amount = parseFloat(amountStr);

    if (!description || description.length < 2) {
      return null;
    }

    return { date, description, amount };
  } catch (error) {
    console.warn('⚠️ Failed to parse Nordea transaction:', error);
    return null;
  }
}

// Convert month name to number
function getMonthNumber(monthName: string): string {
  const months: { [key: string]: string } = {
    'jan': '01', 'feb': '02', 'mar': '03', 'apr': '04',
    'may': '05', 'jun': '06', 'jul': '07', 'aug': '08',
    'sep': '09', 'oct': '10', 'nov': '11', 'dec': '12'
  };
  return months[monthName.toLowerCase()] || '01';
}

// Parse Finnish ALV breakdown table (ALV% / Veroton / Vero / Verollinen)
function parseAlvBreakdown(text: string): { vatRate: number; grossAmount: number }[] {
  console.log('🔍 parseAlvBreakdown — full text:\n', text);

  // Primary: split by newlines; fallback to 2+ spaces when OCR returns a flat string
  const byNewline = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const workingLines = byNewline.length >= 5
    ? byNewline
    : text.split(/\s{2,}/).map(l => l.trim()).filter(l => l.length > 0);

  let headerIdx = -1;
  for (let i = 0; i < workingLines.length; i++) {
    const lower = workingLines[i].toLowerCase();
    if ((lower.includes('alv') || lower.includes('moms')) &&
        (lower.includes('verollinen') || lower.includes('yhteensä') || lower.includes('veroll') || lower.includes('summa'))) {
      headerIdx = i;
      break;
    }
  }
  console.log('🔍 parseAlvBreakdown — headerIdx:', headerIdx, '(line count:', workingLines.length, ')');
  if (headerIdx !== -1) {
    const start = Math.max(0, headerIdx - 5);
    const end = Math.min(workingLines.length, headerIdx + 6);
    console.log('🔍 parseAlvBreakdown — lines around header:', JSON.stringify(workingLines.slice(start, end)));
  }

  // Line-based parse
  if (headerIdx !== -1) {
    const results: { vatRate: number; grossAmount: number }[] = [];
    for (let i = headerIdx + 1; i < workingLines.length && i < headerIdx + 8; i++) {
      const nums = workingLines[i].match(/\d+[,.]\d+/g);
      if (!nums || nums.length < 2) break;
      const vatRate = parseFloat(nums[0].replace(',', '.'));
      const gross = parseFloat(nums[nums.length - 1].replace(',', '.'));
      if (isNaN(vatRate) || isNaN(gross) || vatRate < 0 || vatRate > 100 || gross <= 0) break;
      results.push({ vatRate, grossAmount: gross });
    }
    if (results.length >= 2) return results;
  }

  // Flat-string fallback: find ALV keyword then regex-match 4-number rows
  const alvMatch = text.toLowerCase().match(/alv|moms/);
  if (alvMatch && alvMatch.index !== undefined) {
    const afterHeader = text.substring(alvMatch.index);
    const rowPattern = /(\d+[,.]?\d*)\s+\d+[,.]?\d+\s+\d+[,.]?\d+\s+(\d+[,.]?\d+)/g;
    const results: { vatRate: number; grossAmount: number }[] = [];
    let match;
    while ((match = rowPattern.exec(afterHeader)) !== null) {
      const vatRate = parseFloat(match[1].replace(',', '.'));
      const gross = parseFloat(match[2].replace(',', '.'));
      if (!isNaN(vatRate) && !isNaN(gross) && vatRate >= 0 && vatRate <= 100 && gross > 0) {
        results.push({ vatRate, grossAmount: gross });
      }
      if (results.length >= 5) break;
    }
    console.log('🔍 parseAlvBreakdown — flat regex result:', JSON.stringify(results));
    if (results.length >= 2) return results;
  }

  return [];
}

// JSON response helper
function json(data: any, status: number = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
  });
}