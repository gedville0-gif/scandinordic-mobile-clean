// Supabase Edge Function — PDF Bank Statement Parser
// Deploy: supabase functions deploy pdf-bank-parser
// Usage: POST with { pdfBase64: string, bankId: 'nordea' | 'op' }

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

// Import PDF.js web version (no canvas dependencies)
import 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js';

// Transaction interface matching the spec
export interface Transaction {
  date: string;           // YYYY-MM-DD format
  vendor: string;         // Merchant or counterparty name
  payment_method: string; // Type of transaction
  amount: number;         // Signed decimal, dot separator
}

// TextItem from pdfjs-dist
interface TextItem {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

// BankParser interface
interface BankParser {
  parse(items: TextItem[]): Transaction[];
}

// CORS headers
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

// Size limits — defends against memory-exhaustion attacks (audit issue #9).
// Real bank-statement PDFs are typically <2 MB; 10 MB is a generous ceiling.
const MAX_PDF_BINARY_BYTES = 10 * 1024 * 1024;
const MAX_PDF_BASE64_LENGTH = Math.ceil(MAX_PDF_BINARY_BYTES * 4 / 3) + 100;
const MAX_REQUEST_BODY_BYTES = MAX_PDF_BASE64_LENGTH + 1024; // base64 + JSON envelope

function tooLarge(): Response {
  return new Response(
    JSON.stringify({ error: `PDF too large. Maximum ${MAX_PDF_BINARY_BYTES / (1024 * 1024)} MB.` }),
    { status: 413, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
  );
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: CORS_HEADERS });
  }

  // Pre-parse defense: reject if Content-Length signals an oversized body
  // before we buffer it into memory.
  const declaredSize = parseInt(req.headers.get('content-length') ?? '0', 10);
  if (declaredSize > MAX_REQUEST_BODY_BYTES) return tooLarge();

  try {
    const { pdfBase64, bankId } = await req.json() as {
      pdfBase64: string;
      bankId: 'nordea' | 'op'
    };

    if (!pdfBase64) {
      return new Response(
        JSON.stringify({ error: 'Missing pdfBase64 field' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    // Post-parse defense: even if Content-Length lied, the actual base64
    // string can't exceed our limit.
    if (pdfBase64.length > MAX_PDF_BASE64_LENGTH) return tooLarge();

    if (!bankId || !['nordea', 'op'].includes(bankId)) {
      return new Response(
        JSON.stringify({ error: 'bankId must be "nordea" or "op"' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`🏦 Processing ${bankId} bank statement...`);

    // Convert base64 to Uint8Array
    const pdfData = Uint8Array.from(atob(pdfBase64), c => c.charCodeAt(0));

    // Extract text items with coordinates using pdfjs-dist
    const textItems = await extractTextItems(pdfData);
    console.log(`📄 Extracted ${textItems.length} text items from PDF`);

    if (textItems.length === 0) {
      // Fallback: Try Google Vision OCR for scanned/image PDFs
      console.log('🔄 No structured text found, falling back to Google Vision OCR...');

      return new Response(
        JSON.stringify({
          success: false,
          error: 'No structured text found - PDF may be scanned/image-based',
          fallback_suggestion: 'google_vision_ocr'
        }),
        { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    // Get appropriate parser
    const parser = getParser(bankId);

    // Parse transactions using coordinate-based logic
    const transactions = parser.parse(textItems);
    console.log(`✅ Parsed ${transactions.length} transactions`);

    // Return structured transactions
    return new Response(
      JSON.stringify({
        success: true,
        bankId,
        transactionCount: transactions.length,
        transactions,
        extraction_method: 'pdfjs_coordinates'
      }),
      {
        status: 200,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('❌ PDF parsing error:', error);
    return new Response(
      JSON.stringify({
        error: `PDF parsing failed: ${error.message}`,
        details: error.toString()
      }),
      {
        status: 500,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
      }
    );
  }
});

// Extract text items with coordinates from PDF using pdfjs-dist
async function extractTextItems(pdfData: Uint8Array): Promise<TextItem[]> {
  try {
    console.log(`📄 Processing PDF with ${pdfData.length} bytes`);

    // @ts-ignore - pdfjs-dist global
    const pdf = await globalThis.pdfjsLib.getDocument({ data: pdfData }).promise;
    const allTextItems: TextItem[] = [];

    console.log(`📖 Processing ${pdf.numPages} pages...`);

    // Process all pages
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      console.log(`📄 Processing page ${pageNum}/${pdf.numPages}`);

      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();

      // Extract text items with coordinates
      textContent.items.forEach((item: any, index: number) => {
        if (item.str && item.str.trim()) {
          const textItem: TextItem = {
            str: item.str.trim(),
            x: item.transform[4], // x coordinate
            y: item.transform[5], // y coordinate
            width: item.width || 0,
            height: item.height || item.fontSize || 12
          };

          // Add page offset for multi-page documents
          if (pageNum > 1) {
            textItem.y += (pageNum - 1) * 1000; // Offset each page by 1000 units
          }

          allTextItems.push(textItem);

          // Debug first few items per page
          if (index < 5) {
            console.log(`  Item ${index}: "${textItem.str}" at (${textItem.x.toFixed(1)}, ${textItem.y.toFixed(1)})`);
          }
        }
      });

      console.log(`✅ Page ${pageNum}: extracted ${textContent.items.length} text items`);
    }

    // Sort by y-coordinate (top to bottom), then x-coordinate (left to right)
    // PDF coordinates are bottom-up, so we reverse Y for top-to-bottom reading
    allTextItems.sort((a, b) => {
      const yDiff = b.y - a.y; // Reverse Y (larger Y = higher up = earlier in document)
      return Math.abs(yDiff) < 3 ? a.x - b.x : yDiff;
    });

    console.log(`✅ Total extracted: ${allTextItems.length} text items across ${pdf.numPages} pages`);

    // Log first 10 items for debugging
    console.log('🔍 First 10 text items (sorted):');
    allTextItems.slice(0, 10).forEach((item, i) => {
      console.log(`  ${i}: "${item.str}" at (${item.x.toFixed(1)}, ${item.y.toFixed(1)})`);
    });

    return allTextItems;

  } catch (error) {
    console.error('❌ PDF text extraction error:', error);

    // Check if it's a pdfjs-dist import issue
    if (error.message && error.message.includes('pdfjsLib')) {
      console.error('💡 pdfjs-dist not available - PDF.js library failed to load');
    }

    return [];
  }
}

// Parser registry/factory
function getParser(bankId: string): BankParser {
  switch (bankId) {
    case 'nordea':
      return new NordeaParser();
    case 'op':
      return new OPBankParser();
    default:
      throw new Error(`Unknown bank ID: ${bankId}`);
  }
}

// Nordea Parser Implementation
class NordeaParser implements BankParser {
  parse(items: TextItem[]): Transaction[] {
    console.log('🔍 Parsing Nordea bank statement...');

    const transactions: Transaction[] = [];
    let currentYear = new Date().getFullYear(); // Default year

    // Find year from period header
    for (const item of items) {
      const periodMatch = item.str.match(/Period:\s*\d{1,2}\.\d{1,2}\.(\d{4})/i);
      if (periodMatch) {
        currentYear = parseInt(periodMatch[1]);
        console.log(`📅 Found period year: ${currentYear}`);
        break;
      }
    }

    // Group items by approximate Y coordinate (same line)
    const lines = groupItemsByLine(items);

    let i = 0;
    while (i < lines.length) {
      const line = lines[i];

      // Look for transaction start (DD.MM format in leftmost position)
      const dateItem = findDateItem(line);
      if (dateItem) {
        // Collect transaction block until next date or end
        const transactionLines = [line];
        let j = i + 1;

        while (j < lines.length) {
          const nextLine = lines[j];
          const hasNextDate = findDateItem(nextLine);

          if (hasNextDate) break;

          transactionLines.push(nextLine);
          j++;

          // Limit transaction block size
          if (transactionLines.length > 10) break;
        }

        // Parse the transaction block
        try {
          const transaction = this.parseTransactionBlock(transactionLines, currentYear);
          if (transaction && this.isValidTransaction(transaction)) {
            transactions.push(transaction);
          }
        } catch (error) {
          console.warn('⚠️ Failed to parse Nordea transaction block:', error);
        }

        i = j;
      } else {
        i++;
      }
    }

    return transactions;
  }

  private parseTransactionBlock(lines: TextItem[][], year: number): Transaction | null {
    if (lines.length < 2) return null;

    const firstLine = lines[0];
    const secondLine = lines[1];

    // Extract date (DD.MM format)
    const dateItem = findDateItem(firstLine);
    if (!dateItem) return null;

    const dateMatch = dateItem.str.match(/(\d{1,2})\.(\d{1,2})/);
    if (!dateMatch) return null;

    const day = dateMatch[1].padStart(2, '0');
    const month = dateMatch[2].padStart(2, '0');
    const date = `${year}-${month}-${day}`;

    // Nordea PDF columns by X position (left→right):
    //   BookingDate | ValueDay | Payee | Amount | Balance
    // Amount is second-from-right; Balance is rightmost (must be ignored).
    // Allow Finnish thousands separators (space / non-breaking space) e.g. "1 875,66".
    const isAmountStr = (s: string) =>
      /^[-+]?\d{1,3}(?:[\s ]\d{3})*,\d{2}$/.test(s) ||
      /^[-+]?\d+,\d{2}$/.test(s);

    const numericItems = firstLine
      .filter(item => isAmountStr(item.str))
      .sort((a, b) => a.x - b.x);

    if (numericItems.length === 0) return null;

    // 2+ numerics: second-from-right is Amount, rightmost is Balance (ignored).
    // 1 numeric: treat as Amount.
    const amountItem = numericItems.length >= 2
      ? numericItems[numericItems.length - 2]
      : numericItems[numericItems.length - 1];

    const amountStr = amountItem.str.replace(/[\s ]/g, '').replace(',', '.');
    const amount = parseFloat(amountStr);
    if (!isFinite(amount) || amount === 0) return null;

    // Build vendor: exclude every date-like item and every numeric item
    // (so Amount and Balance can never leak into the description).
    const excluded = new Set<TextItem>(numericItems);
    const isDateStr = (s: string) => /^\d{1,2}\.\d{1,2}$/.test(s);

    let vendor = firstLine
      .filter(item =>
        !excluded.has(item) &&
        !isDateStr(item.str) &&
        item.str.length > 1
      )
      .map(item => item.str)
      .join(' ')
      .trim();

    // Defense in depth: if pdfjs merged "VENDOR 1 875,66" into one text item,
    // strip the trailing number pattern.
    vendor = vendor
      .replace(/\s*[-+]?\d{1,3}(?:[\s ]\d{3})*,\d{2}\s*$/, '')
      .replace(/\s*[-+]?\d+,\d{2}\s*$/, '')
      .trim();

    if (!vendor) return null;

    // Extract payment method (second line)
    const payment_method = secondLine
      .map(item => item.str)
      .join(' ')
      .trim();

    return {
      date,
      vendor,
      payment_method,
      amount
    };
  }

  private isValidTransaction(transaction: Transaction): boolean {
    // Skip balance rows
    if (transaction.vendor.toLowerCase().includes('balance')) return false;

    // Skip summary rows
    if (transaction.vendor.toLowerCase().includes('total deposits')) return false;
    if (transaction.vendor.toLowerCase().includes('total withdrawals')) return false;

    // Must have meaningful vendor name
    if (transaction.vendor.length < 2) return false;

    return true;
  }
}

// OP Bank Parser Implementation
class OPBankParser implements BankParser {
  parse(items: TextItem[]): Transaction[] {
    console.log('🔍 Parsing OP bank statement...');

    const transactions: Transaction[] = [];

    // Group items by approximate Y coordinate (same line)
    const lines = groupItemsByLine(items);

    let i = 0;
    while (i < lines.length) {
      const line = lines[i];

      // Look for transaction start - date followed by amount on same line
      const transactionMatch = this.findOPTransactionStart(line);
      if (transactionMatch) {
        // Collect transaction block (usually 2-5 lines)
        const transactionLines = [line];
        let j = i + 1;

        // Collect lines until next transaction or balance
        while (j < lines.length && transactionLines.length < 8) {
          const nextLine = lines[j];
          const hasNextTransaction = this.findOPTransactionStart(nextLine);
          const hasBalance = nextLine.some(item =>
            /^[+-]?\d{1,6}[.]\d{2}\s+(Balance|Deposits|Withdrawals)/i.test(item.str)
          );

          if (hasNextTransaction || hasBalance) break;

          transactionLines.push(nextLine);
          j++;
        }

        // Parse the transaction block
        try {
          const transaction = this.parseOPTransactionBlock(transactionLines, transactionMatch);
          if (transaction && this.isValidOPTransaction(transaction)) {
            transactions.push(transaction);
          }
        } catch (error) {
          console.warn('⚠️ Failed to parse OP transaction block:', error);
        }

        i = j;
      } else {
        i++;
      }
    }

    return transactions;
  }

  private findOPTransactionStart(line: TextItem[]): { dateItem: TextItem, amountItem: TextItem } | null {
    // Look for date pattern: "2 Mar 2026"
    const dateItem = line.find(item =>
      /^\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4}$/i.test(item.str)
    );

    if (!dateItem) return null;

    // Look for amount pattern: "+331.05" or "-556.66"
    const amountItem = line.find(item =>
      /^[+-]\d{1,6}\.\d{2}$/.test(item.str)
    );

    return dateItem && amountItem ? { dateItem, amountItem } : null;
  }

  private parseOPTransactionBlock(lines: TextItem[][], transactionMatch: { dateItem: TextItem, amountItem: TextItem }): Transaction | null {
    if (lines.length < 1) return null;

    const firstLine = lines[0];

    // Extract date
    const date = this.normalizeOPDate(transactionMatch.dateItem.str);
    if (!date) return null;

    // Extract amount
    const amount = parseFloat(transactionMatch.amountItem.str);

    // Find payment method (BANK TRANSFER, CARD PAYMENT, etc.)
    let payment_method = '';
    for (const line of lines) {
      const methodItem = line.find(item =>
        this.isPaymentMethodKeyword(item.str)
      );
      if (methodItem) {
        payment_method = methodItem.str.toUpperCase();
        break;
      }
    }

    if (!payment_method) {
      // Default based on amount pattern or context
      payment_method = 'BANK TRANSFER';
    }

    // Find vendor name - look for the main payee/merchant name
    let vendor = '';

    // Strategy 1: Look for known vendor patterns in first few lines
    for (let i = 0; i < Math.min(3, lines.length); i++) {
      const line = lines[i];

      for (const item of line) {
        // Skip date, amount, payment method, and reference numbers
        if (item === transactionMatch.dateItem ||
            item === transactionMatch.amountItem ||
            this.isPaymentMethodKeyword(item.str) ||
            /^\d{10,}$/.test(item.str) || // Reference numbers
            /^20\d{14,}/.test(item.str) || // Filing numbers
            item.str.length < 3) {
          continue;
        }

        // Look for vendor-like text
        if (this.looksLikeVendor(item.str)) {
          vendor = item.str;
          break;
        }
      }

      if (vendor) break;
    }

    // Strategy 2: If no vendor found, combine meaningful text from first line after date/amount
    if (!vendor) {
      vendor = firstLine
        .filter(item =>
          item !== transactionMatch.dateItem &&
          item !== transactionMatch.amountItem &&
          !this.isPaymentMethodKeyword(item.str) &&
          !/^\d{10,}$/.test(item.str) &&
          item.str.length >= 3
        )
        .map(item => item.str)
        .join(' ')
        .trim();
    }

    // Strategy 3: Look in subsequent lines for vendor name
    if (!vendor && lines.length > 1) {
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        const possibleVendor = line
          .filter(item =>
            !this.isPaymentMethodKeyword(item.str) &&
            !/^\d{10,}$/.test(item.str) &&
            !/^20\d{14,}/.test(item.str) &&
            item.str.length >= 3 &&
            !item.str.toLowerCase().includes('message') &&
            !item.str.toLowerCase().includes('sepa')
          )
          .map(item => item.str)
          .join(' ')
          .trim();

        if (possibleVendor && possibleVendor.length > 2) {
          vendor = possibleVendor;
          break;
        }
      }
    }

    if (!vendor) return null;

    return {
      date,
      vendor,
      payment_method,
      amount
    };
  }

  private looksLikeVendor(text: string): boolean {
    // Company/vendor indicators
    const vendorIndicators = [
      'OY', 'AB', 'LTD', 'INC', 'CORP', 'LLC', 'GROUP', 'OPERATIONS',
      'MARKET', 'STORE', 'SHOP', 'BANK', 'INSURANCE', 'TRANSPORT',
      'LAHTI', 'HELSINKI', 'FINLAND', 'NORDIC', 'EUROPE'
    ];

    const upperText = text.toUpperCase();
    return vendorIndicators.some(indicator => upperText.includes(indicator)) ||
           /^[A-Z][A-Z\s&-]+[A-Z]$/.test(text); // All caps company names
  }

  private isPaymentMethodKeyword(str: string): boolean {
    const keywords = ['BANK TRANSFER', 'CARD PAYMENT', 'PAYMENT SERVICE', 'TRANSACTION FEE'];
    return keywords.some(keyword => str.toUpperCase().includes(keyword));
  }

  private normalizeOPDate(dateStr: string): string | null {
    const match = dateStr.match(/(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{4})/i);
    if (!match) return null;

    const day = match[1].padStart(2, '0');
    const monthName = match[2].toLowerCase();
    const year = match[3];

    const months: { [key: string]: string } = {
      jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
      jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
    };

    const month = months[monthName];
    if (!month) return null;

    return `${year}-${month}-${day}`;
  }

  private isValidOPTransaction(transaction: Transaction): boolean {
    // Skip balance rows
    if (transaction.vendor.toLowerCase().includes('balance')) return false;

    // Skip summary rows
    if (transaction.vendor.toLowerCase().includes('deposits') &&
        transaction.vendor.toLowerCase().includes('pcs')) return false;
    if (transaction.vendor.toLowerCase().includes('withdrawals') &&
        transaction.vendor.toLowerCase().includes('pcs')) return false;

    // Must have meaningful vendor name
    if (transaction.vendor.length < 3) return false;

    return true;
  }
}

// Utility function to group text items by line (similar Y coordinates)
function groupItemsByLine(items: TextItem[]): TextItem[][] {
  const lines: TextItem[][] = [];
  const lineThreshold = 5; // Pixels

  for (const item of items) {
    // Find existing line with similar Y coordinate
    let foundLine = false;

    for (const line of lines) {
      if (line.length > 0 && Math.abs(line[0].y - item.y) <= lineThreshold) {
        line.push(item);
        foundLine = true;
        break;
      }
    }

    if (!foundLine) {
      lines.push([item]);
    }
  }

  // Sort items within each line by X coordinate
  lines.forEach(line => {
    line.sort((a, b) => a.x - b.x);
  });

  return lines;
}

// Utility function to find date item in Nordea format (DD.MM)
function findDateItem(line: TextItem[]): TextItem | null {
  return line.find(item => /^\d{1,2}\.\d{1,2}$/.test(item.str)) || null;
}