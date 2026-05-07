import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { PDFExtractor } from './utils/pdfExtractor.js';
import { OPParser } from './parsers/OPParser.js';
import { NordeaParser } from './parsers/NordeaParser.js';

const app = express();
const PORT = process.env.PORT || 3000;
const PARSER_SECRET = process.env.PARSER_SECRET || 'default-secret';

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Auth middleware
const requireAuth = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const secret = req.headers['x-parser-secret'];

  if (!secret || secret !== PARSER_SECRET) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized: Invalid or missing X-Parser-Secret header'
    });
  }

  next();
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

    if (!bankId || !['op', 'nordea'].includes(bankId.toLowerCase())) {
      return res.status(400).json({
        success: false,
        error: 'Invalid bankId (must be "op" or "nordea")'
      });
    }

    const bank = bankId.toLowerCase();
    console.log(`🏦 Processing ${bank.toUpperCase()} bank statement`);

    // Extract text from PDF
    console.log('📄 Extracting text from PDF...');
    const extractedData = await PDFExtractor.extractText(pdf);
    console.log(`📄 Extracted ${extractedData.items.length} text items from ${extractedData.pageCount} pages`);

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
  console.log(`🔐 Auth secret: ${PARSER_SECRET === 'default-secret' ? '⚠️  Using default secret!' : '✅ Custom secret configured'}`);
  console.log('📋 Available endpoints:');
  console.log('   GET  /health - Health check');
  console.log('   POST /parse  - Parse PDF (requires X-Parser-Secret header)');
});

export default app;