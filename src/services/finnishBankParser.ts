export interface ParsedTransaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  type: 'income' | 'expense';
  category: string;
  veroCategory?: string;
  payment_method?: string;
}

export interface BankParserResult {
  transactions: ParsedTransaction[];
  bankType: string;
  totalFound: number;
  incomeCount: number;
  expenseCount: number;
}

// Finnish bank detection patterns
const BANK_PATTERNS = {
  OP: /OP|Osuuspankki|omasp|OP Ryhmä|op\.fi/i,
  NORDEA: /Nordea|NDEAFIHH|nordea\.fi/i,
  SPANKKI: /S-Pankki|S-Bank|s-pankki\.fi/i,
  DANSKE: /Danske Bank|danske\.fi|Sampo Pankki/i,
  HANDELSBANKEN: /Handelsbanken|handelsbanken\.fi/i,
  AKTIA: /Aktia|aktia\.fi/i
};

// Finnish amount parsing (handles comma as decimal separator)
function parseFinAmount(amountStr: string): number {
  if (!amountStr) return 0;

  // Remove currency symbols and spaces
  let cleaned = amountStr.replace(/[€$£\s]/g, '');

  // Handle negative indicators
  const isNegative = cleaned.startsWith('-') || cleaned.startsWith('+') ? cleaned.startsWith('-') : false;
  cleaned = cleaned.replace(/^[+-]/, '');

  // Convert Finnish comma to dot for decimal
  cleaned = cleaned.replace(',', '.');

  // Parse the number
  const amount = parseFloat(cleaned) || 0;
  return isNegative ? -Math.abs(amount) : Math.abs(amount);
}

// Finnish date parsing (supports DD.MM.YYYY, DD/MM/YYYY, YYYY-MM-DD)
function parseFinDate(dateStr: string): string {
  if (!dateStr) return new Date().toISOString().split('T')[0];

  // Try different Finnish date formats
  const patterns = [
    /(\d{1,2})\.(\d{1,2})\.(\d{4})/, // DD.MM.YYYY
    /(\d{1,2})\/(\d{1,2})\/(\d{4})/, // DD/MM/YYYY
    /(\d{4})-(\d{1,2})-(\d{1,2})/, // YYYY-MM-DD
  ];

  for (const pattern of patterns) {
    const match = dateStr.match(pattern);
    if (match) {
      if (pattern.toString().includes('4}-')) {
        // YYYY-MM-DD format
        const [, year, month, day] = match;
        return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      } else {
        // DD.MM.YYYY or DD/MM/YYYY format
        const [, day, month, year] = match;
        return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      }
    }
  }

  // If no pattern matches, try to parse as standard date
  const date = new Date(dateStr);
  if (!isNaN(date.getTime())) {
    return date.toISOString().split('T')[0];
  }

  // Default to today
  return new Date().toISOString().split('T')[0];
}

// Detect bank type from text
function detectBankType(text: string): string {
  for (const [bank, pattern] of Object.entries(BANK_PATTERNS)) {
    if (pattern.test(text)) {
      return bank;
    }
  }
  return 'UNKNOWN';
}

// Generate unique transaction ID
function generateTransactionId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

// Categorize transaction based on description
function categorizeTransaction(description: string, amount: number): { category: string; veroCategory: string } {
  const desc = description.toLowerCase();
  const isIncome = amount > 0;

  if (isIncome) {
    // Income categories
    if (desc.includes('palkka') || desc.includes('salary') || desc.includes('lön')) {
      return { category: 'consulting_services', veroCategory: 'Business Income' };
    }
    if (desc.includes('korko') || desc.includes('interest') || desc.includes('dividend')) {
      return { category: 'consulting_services', veroCategory: 'Investment Income' };
    }
    if (desc.includes('bonus') || desc.includes('provisio')) {
      return { category: 'consulting_services', veroCategory: 'Business Income' };
    }
    return { category: 'consulting_services', veroCategory: 'Business Income' };
  } else {
    // Expense categories
    if (desc.includes('market') || desc.includes('kauppa') || desc.includes('alepa') || desc.includes('k-market')) {
      return { category: 'fuel', veroCategory: 'Other deductible expenses' };
    }
    if (desc.includes('bensa') || desc.includes('shell') || desc.includes('neste') || desc.includes('st1')) {
      return { category: 'fuel', veroCategory: 'Vehicle expenses' };
    }
    if (desc.includes('vakuutus') || desc.includes('insurance') || desc.includes('pohjola')) {
      return { category: 'fuel', veroCategory: 'Insurance expenses' };
    }
    if (desc.includes('vuokra') || desc.includes('rent') || desc.includes('hyra')) {
      return { category: 'fuel', veroCategory: 'Rent expenses' };
    }
    if (desc.includes('sähkö') || desc.includes('electricity') || desc.includes('vattenfall') || desc.includes('elisa')) {
      return { category: 'fuel', veroCategory: 'Utilities' };
    }
    return { category: 'fuel', veroCategory: 'Other deductible expenses' };
  }
}

// Main parsing function for Finnish bank statements
export function parseFinnishBankStatement(rawText: string): BankParserResult {
  console.log('🏦 Starting Finnish bank statement parsing');
  console.log('📄 Text length:', rawText.length);

  const transactions: ParsedTransaction[] = [];
  const bankType = detectBankType(rawText);

  console.log('🏦 Detected bank:', bankType);

  // Split text into lines for processing
  const lines = rawText.split('\n').map(line => line.trim()).filter(Boolean);
  console.log('📄 Total lines to process:', lines.length);

  // Different parsing strategies based on bank type
  switch (bankType) {
    case 'OP':
      parseOPBankStatement(lines, transactions);
      break;
    case 'NORDEA':
      parseNordeaBankStatement(lines, transactions);
      break;
    case 'SPANKKI':
      parseSPankkiBankStatement(lines, transactions);
      break;
    case 'DANSKE':
      parseDanskeBankStatement(lines, transactions);
      break;
    default:
      parseGenericBankStatement(lines, transactions);
      break;
  }

  const incomeCount = transactions.filter(t => t.type === 'income').length;
  const expenseCount = transactions.filter(t => t.type === 'expense').length;

  console.log('✅ Parsing complete:');
  console.log(`📊 Total transactions: ${transactions.length}`);
  console.log(`💰 Income: ${incomeCount}, Expenses: ${expenseCount}`);

  return {
    transactions,
    bankType,
    totalFound: transactions.length,
    incomeCount,
    expenseCount
  };
}

// OP Bank specific parsing
function parseOPBankStatement(lines: string[], transactions: ParsedTransaction[]): void {
  console.log('🔍 Parsing OP bank statement with multi-line blocks');

  // OP Bank payment method keywords
  const paymentMethods = [
    'BANK TRANSFER',
    'CARD PAYMENT',
    'PAYMENT SERVICE',
    'TRANSACTION FEE',
    'PANKKISIIRTO',
    'KORTTIMAKSU',
    'MAKSUPALVELU',
    'PALVELUMAKSU'
  ];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Check if this line starts a new transaction ("D Mon YYYY" format)
    const dateMatch = line.match(/^(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|tammi|helmi|maalis|huhti|touko|kesä|heinä|elo|syys|loka|marras|joulu)\s+(\d{4})/i);
    if (dateMatch) {
      const [, day, monthStr, year] = dateMatch;
      const transactionBlock: string[] = [];

      // Collect all lines in this transaction block until next date or end
      let j = i;
      while (j < lines.length) {
        const currentLine = lines[j];

        // If we hit another date line (and it's not the first one), stop collecting
        if (j > i && currentLine.match(/^\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|tammi|helmi|maalis|huhti|touko|kesä|heinä|elo|syys|loka|marras|joulu)\s+\d{4}/i)) {
          break;
        }

        transactionBlock.push(currentLine);
        j++;
      }

      // Parse the transaction block
      if (transactionBlock.length >= 2) {
        try {
          let payment_method = '';
          let amount = 0;
          let vendor = '';

          // Find payment method line (contains keywords and amount)
          for (const blockLine of transactionBlock) {
            const methodFound = paymentMethods.find(method =>
              blockLine.toUpperCase().includes(method)
            );

            if (methodFound) {
              payment_method = methodFound;

              // Extract amount from same line as payment method
              const amountMatch = blockLine.match(/([-+]?\d+[.,]\d{2})/);
              if (amountMatch) {
                amount = parseFinAmount(amountMatch[1]);
                break;
              }
            }
          }

          // Find vendor (line after payment method, or first non-date line)
          let foundPaymentMethod = false;
          for (const blockLine of transactionBlock) {
            if (foundPaymentMethod) {
              // This is the line after payment method = vendor
              vendor = blockLine.trim();
              break;
            }

            // Check if this line contains a payment method
            if (paymentMethods.some(method => blockLine.toUpperCase().includes(method))) {
              foundPaymentMethod = true;
            }
          }

          // If no vendor found after payment method, use first non-date line as fallback
          if (!vendor) {
            for (let k = 1; k < transactionBlock.length; k++) {
              const blockLine = transactionBlock[k].trim();
              if (blockLine && !paymentMethods.some(method => blockLine.toUpperCase().includes(method))) {
                vendor = blockLine;
                break;
              }
            }
          }

          // Convert month name to number
          const monthMap: { [key: string]: string } = {
            'jan': '01', 'feb': '02', 'mar': '03', 'apr': '04', 'may': '05', 'jun': '06',
            'jul': '07', 'aug': '08', 'sep': '09', 'oct': '10', 'nov': '11', 'dec': '12',
            'tammi': '01', 'helmi': '02', 'maalis': '03', 'huhti': '04', 'touko': '05', 'kesä': '06',
            'heinä': '07', 'elo': '08', 'syys': '09', 'loka': '10', 'marras': '11', 'joulu': '12'
          };

          const monthNum = monthMap[monthStr.toLowerCase()] || '01';
          const parsedDate = `${year}-${monthNum}-${day.padStart(2, '0')}`;

          if (Math.abs(amount) > 0 && vendor) {
            const { category, veroCategory } = categorizeTransaction(vendor, amount);

            transactions.push({
              id: generateTransactionId(),
              date: parsedDate,
              description: vendor,
              amount: Math.abs(amount),
              type: amount >= 0 ? 'income' : 'expense',
              category,
              veroCategory,
              payment_method
            });

            console.log(`📝 OP transaction: ${vendor} | ${payment_method} | ${amount}€`);
          }
        } catch (error) {
          console.log('⚠️ Error parsing OP transaction block:', error);
        }
      }

      // Move to next transaction block
      i = j;
    } else {
      i++;
    }
  }
}

// Nordea Bank specific parsing
function parseNordeaBankStatement(lines: string[], transactions: ParsedTransaction[]): void {
  console.log('🔍 Parsing Nordea bank statement with multi-line blocks');

  // Find year from Period header line (e.g., "Period: 01.01.2024 - 31.12.2024")
  let currentYear = new Date().getFullYear().toString();
  for (const line of lines) {
    const periodMatch = line.match(/Period:\s*\d{1,2}\.\d{1,2}\.(\d{4})/i);
    if (periodMatch) {
      currentYear = periodMatch[1];
      console.log('📅 Found year in period header:', currentYear);
      break;
    }
  }

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Check if this line starts a new transaction (DD.MM format at start)
    const dateMatch = line.match(/^(\d{1,2}\.\d{1,2})\s/);
    if (dateMatch) {
      const [, datePrefix] = dateMatch;
      const transactionBlock: string[] = [];

      // Collect all lines in this transaction block until next date or end
      let j = i;
      while (j < lines.length) {
        const currentLine = lines[j];

        // If we hit another date line (and it's not the first one), stop collecting
        if (j > i && currentLine.match(/^\d{1,2}\.\d{1,2}\s/)) {
          break;
        }

        transactionBlock.push(currentLine);
        j++;
      }

      // Parse the transaction block
      if (transactionBlock.length >= 2) {
        try {
          // Line 1 of block = vendor (remove date prefix)
          const vendor = transactionBlock[0].replace(/^\d{1,2}\.\d{1,2}\s+/, '').trim();

          // Line 2 of block = payment_method
          const payment_method = transactionBlock.length > 1 ? transactionBlock[1].trim() : '';

          // Last line = amount (convert comma to dot)
          const lastLine = transactionBlock[transactionBlock.length - 1];
          const amountMatch = lastLine.match(/([-+]?\d+[.,]\d{2})(?:\s*€)?$/);

          if (amountMatch && vendor) {
            const amountStr = amountMatch[1];
            const amount = parseFinAmount(amountStr);
            const fullDate = `${datePrefix}.${currentYear}`;
            const parsedDate = parseFinDate(fullDate);

            if (Math.abs(amount) > 0) {
              const { category, veroCategory } = categorizeTransaction(vendor, amount);

              transactions.push({
                id: generateTransactionId(),
                date: parsedDate,
                description: vendor,
                amount: Math.abs(amount),
                type: amount >= 0 ? 'income' : 'expense',
                category,
                veroCategory,
                payment_method
              });

              console.log(`📝 Nordea transaction: ${vendor} | ${payment_method} | ${amount}€`);
            }
          }
        } catch (error) {
          console.log('⚠️ Error parsing Nordea transaction block:', error);
        }
      }

      // Move to next transaction block
      i = j;
    } else {
      i++;
    }
  }
}

// S-Pankki specific parsing
function parseSPankkiBankStatement(lines: string[], transactions: ParsedTransaction[]): void {
  console.log('🔍 Parsing S-Pankki bank statement');
  // Use generic parsing for now, can be specialized later
  parseGenericBankStatement(lines, transactions);
}

// Danske Bank specific parsing
function parseDanskeBankStatement(lines: string[], transactions: ParsedTransaction[]): void {
  console.log('🔍 Parsing Danske Bank statement');
  // Use generic parsing for now, can be specialized later
  parseGenericBankStatement(lines, transactions);
}

// Generic bank statement parsing (fallback)
function parseGenericBankStatement(lines: string[], transactions: ParsedTransaction[]): void {
  console.log('🔍 Parsing with generic bank statement parser');

  // Try multiple patterns to catch different formats
  const patterns = [
    /(\d{1,2}[\.\/\-]\d{1,2}[\.\/\-]\d{2,4})\s+(.+?)\s+([-+]?\d+[.,]\d{2})/,
    /(.+?)\s+(\d{1,2}[\.\/\-]\d{1,2}[\.\/\-]\d{2,4})\s+([-+]?\d+[.,]\d{2})/,
    /(\d{2,4}[-\/]\d{1,2}[-\/]\d{1,2})\s+(.+?)\s+([-+]?\d+[.,]\d{2})/
  ];

  for (const line of lines) {
    let matched = false;

    for (const pattern of patterns) {
      const match = line.match(pattern);
      if (match) {
        let dateStr, description, amountStr;

        if (pattern.toString().includes('(.+?)\\s+(\\d')) {
          // Pattern 2: Description Date Amount
          [, description, dateStr, amountStr] = match;
        } else {
          // Pattern 1 & 3: Date Description Amount
          [, dateStr, description, amountStr] = match;
        }

        const date = parseFinDate(dateStr);
        const amount = parseFinAmount(amountStr);
        const cleanDescription = description.trim();

        if (Math.abs(amount) > 0 && cleanDescription.length > 1) {
          const { category, veroCategory } = categorizeTransaction(cleanDescription, amount);

          transactions.push({
            id: generateTransactionId(),
            date,
            description: cleanDescription,
            amount: Math.abs(amount),
            type: amount >= 0 ? 'income' : 'expense',
            category,
            veroCategory
          });

          matched = true;
          break;
        }
      }
    }

    if (matched) continue;

    // Try to extract JSON transactions if present (from previous Gemini responses)
    if (line.includes('"date"') && line.includes('"amount"')) {
      try {
        const jsonMatch = line.match(/\{[^}]+\}/g);
        if (jsonMatch) {
          for (const jsonStr of jsonMatch) {
            try {
              const parsed = JSON.parse(jsonStr);
              if (parsed.date && parsed.description && parsed.amount !== undefined) {
                const { category, veroCategory } = categorizeTransaction(parsed.description, parsed.amount);

                transactions.push({
                  id: generateTransactionId(),
                  date: parseFinDate(parsed.date),
                  description: parsed.description.trim(),
                  amount: Math.abs(parsed.amount),
                  type: parsed.amount >= 0 ? 'income' : 'expense',
                  category,
                  veroCategory
                });
              }
            } catch (jsonError) {
              // Ignore JSON parsing errors
            }
          }
        }
      } catch (error) {
        // Ignore JSON extraction errors
      }
    }
  }
}