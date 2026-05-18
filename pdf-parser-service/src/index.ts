import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import jwt from 'jsonwebtoken';
import { PDFExtractor } from './utils/pdfExtractor.js';
import { OPParser } from './parsers/OPParser.js';
import { NordeaParser } from './parsers/NordeaParser.js';

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);
// Supabase JWT secret — copy from dashboard → Settings → API → JWT Secret.
// Replaces the old shared-secret model (audit issue #4): a client-side
// secret is trivially extracted from the APK, so we now verify the user's
// Supabase access token (HS256) on every request.
const SUPABASE_JWT_SECRET = process.env.SUPABASE_JWT_SECRET || '';

// Size limits — defends against memory-exhaustion attacks (audit issue #9).
// Real bank-statement PDFs are typically <2 MB; 10 MB is a generous ceiling.
const MAX_PDF_BINARY_BYTES = 10 * 1024 * 1024;
const MAX_PDF_BASE64_LENGTH = Math.ceil(MAX_PDF_BINARY_BYTES * 4 / 3) + 100;
// Express body limit must accommodate the base64 string + JSON envelope.
// Was '50mb' — comically high and the documented attack vector.
const EXPRESS_BODY_LIMIT = '14mb';

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: EXPRESS_BODY_LIMIT }));
app.use(express.urlencoded({ extended: true, limit: EXPRESS_BODY_LIMIT }));

// Auth middleware — verifies the caller's Supabase JWT (HS256, signed with
// SUPABASE_JWT_SECRET). On success, attaches { userId } to req for logging.
const requireAuth = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (!SUPABASE_JWT_SECRET) {
    return res.status(500).json({
      success: false,
      error: 'Server misconfigured: SUPABASE_JWT_SECRET not set'
    });
  }

  const authHeader = req.headers['authorization'] ?? req.headers['Authorization'];
  const headerStr = Array.isArray(authHeader) ? authHeader[0] : authHeader;
  const token = headerStr?.startsWith('Bearer ') ? headerStr.slice(7) : null;

  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized: missing Authorization Bearer token'
    });
  }

  try {
    const decoded = jwt.verify(token, SUPABASE_JWT_SECRET, { algorithms: ['HS256'] }) as { sub?: string };
    if (!decoded.sub) {
      return res.status(401).json({ success: false, error: 'Unauthorized: token has no subject' });
    }
    (req as any).userId = decoded.sub;
    next();
  } catch (err) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized: invalid or expired token'
    });
  }
};

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'pdf-parser-service',
    timestamp: new Date().toISOString()
  });
});

// Main parse endpoint
app.post('/parse', requireAuth, async (req, res) => {
  try {
    console.log('📄 Received PDF parse request');

    const { pdf, bankId } = req.body;

    // Validate input
    if (!pdf || typeof pdf !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Missing or invalid pdf field (must be base64 string)'
      });
    }

    // Defense-in-depth: even if Express body limit was bypassed somehow,
    // reject oversized base64 strings explicitly.
    if (pdf.length > MAX_PDF_BASE64_LENGTH) {
      return res.status(413).json({
        success: false,
        error: `PDF too large. Maximum ${MAX_PDF_BINARY_BYTES / (1024 * 1024)} MB.`
      });
    }

    if (!bankId || !['op', 'nordea'].includes(bankId.toLowerCase())) {
      return res.status(400).json({
        success: false,
        error: 'Invalid bankId (must be "op" or "nordea")'
      });
    }

    const requestedBank = bankId.toLowerCase();
    console.log(`🏦 Requested bank: ${requestedBank.toUpperCase()}`);

    // Extract text from PDF
    console.log('📄 Extracting text from PDF...');
    const extractedData = await PDFExtractor.extractText(pdf);
    console.log(`📄 Extracted ${extractedData.items.length} text items from ${extractedData.pageCount} pages`);

    // Auto-detect bank from PDF text content
    const fullText = extractedData.items.map(item => item.str).join(' ');

    const isNordea = /Nordea|NDEAFIHH|nordea\.fi/i.test(fullText);
    const isOP = /Osuuspankki|OP Ryhmä|OKOYFIHH|op\.fi/i.test(fullText);

    let detectedBank = requestedBank;
    if (isNordea && !isOP) {
      detectedBank = 'nordea';
      console.log('🔍 Auto-detected: Nordea (found Nordea keywords)');
    } else if (isOP && !isNordea) {
      detectedBank = 'op';
      console.log('🔍 Auto-detected: OP Bank (found OP keywords)');
    } else {
      console.log(`🔍 Could not auto-detect, using requested: ${requestedBank}`);
    }

    // Warn if requested bank differs from detected bank
    if (detectedBank !== requestedBank) {
      console.log(`⚠️ Bank mismatch! Requested: ${requestedBank}, Detected: ${detectedBank}. Using detected.`);
    }

    const bank = detectedBank;
    console.log(`🏦 Processing as ${bank.toUpperCase()} bank statement`);

    // Parse based on bank type
    let transactions;
    if (bank === 'op') {
      transactions = OPParser.parse(extractedData.items);
    } else if (bank === 'nordea') {
      transactions = NordeaParser.parse(extractedData.items);
    } else {
      throw new Error(`Unsupported bank: ${bank}`);
    }

    console.log(`✅ Parsed ${transactions.length} transactions`);

    // Return results
    res.json({
      success: true,
      transactions,
      count: transactions.length,
      bankId: bank,
      requestedBank,
      detectedBank,
      bankMismatch: detectedBank !== requestedBank,
      metadata: {
        pageCount: extractedData.pageCount,
        textItems: extractedData.items.length,
        parsedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('❌ Parse error:', error);

    res.status(500).json({
      success: false,
      error: error.message || 'Failed to parse PDF',
      timestamp: new Date().toISOString()
    });
  }
});

// Handle 404
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found'
  });
});

// Error handler
app.use((error: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('💥 Server error:', error);

  res.status(500).json({
    success: false,
    error: 'Internal server error',
    timestamp: new Date().toISOString()
  });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log('🚀 PDF Parser Service started');
  console.log(`📡 Server running on port ${PORT}`);
  console.log(`🔐 Auth: ${SUPABASE_JWT_SECRET ? '✅ Supabase JWT verify enabled' : '⚠️  SUPABASE_JWT_SECRET not set — all requests will 500'}`);
  console.log('📋 Available endpoints:');
  console.log('   GET  /health - Health check');
  console.log('   POST /parse  - Parse PDF (requires Authorization: Bearer <supabase JWT>)');
});

export default app;