import { TextItem } from '../utils/pdfExtractor';

export interface Transaction {
  date: string;
  description: string;
  amount: number;
  type: 'income' | 'expense';
}

export class OPParser {

  /**
   * Parse OP Bank PDF text items into transactions
   */
  static parse(items: TextItem[]): Transaction[] {
    console.log('🏦 Starting OP Bank parsing...');

    const transactions: Transaction[] = [];
    const lines = this.groupItemsByLines(items);

    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      const lineText = this.lineToText(line);

      // Check for OP Bank date pattern: "D Mon YYYY" (e.g. "2 Mar 2026")
      const dateMatch = lineText.match(/^(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{4})/i);

      if (dateMatch) {
        console.log(`📅 Found date line: ${lineText}`);

        // Collect transaction block (all lines until next date or end)
        const transactionLines: string[] = [];
        let j = i;

        while (j < lines.length) {
          const currentLineText = this.lineToText(lines[j]);

          // Stop if we hit another date (but not the first one)
          if (j > i && currentLineText.match(/^\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4}/i)) {
            break;
          }

          transactionLines.push(currentLineText);
          j++;
        }

        // Parse the collected transaction block
        const transaction = this.parseTransactionBlock(transactionLines, dateMatch);
        if (transaction) {
          transactions.push(transaction);
        }

        i = j;
      } else {
        i++;
      }
    }

    console.log(`✅ OP Bank parsing complete: ${transactions.length} transactions`);
    return transactions;
  }

  /**
   * Parse a transaction block (multiple lines for one transaction)
   */
  private static parseTransactionBlock(lines: string[], dateMatch: RegExpMatchArray): Transaction | null {
    const [, day, month, year] = dateMatch;

    // OP Bank payment method keywords
    const paymentMethods = [
      'BANK TRANSFER', 'CARD PAYMENT', 'PAYMENT SERVICE', 'TRANSACTION FEE'
    ];

    let amount = 0;
    let description = '';
    let paymentMethodFound = false;

    // Find line with payment method and amount
    for (const line of lines) {
      const methodMatch = paymentMethods.find(method =>
        line.toUpperCase().includes(method)
      );

      if (methodMatch) {
        paymentMethodFound = true;

        // Extract amount from same line (format: +331.05 or -556.66)
        const amountMatch = line.match(/([-+]\d+\.\d{2})/);
        if (amountMatch) {
          amount = parseFloat(amountMatch[1]);
        }
        break;
      }
    }

    // Find vendor/description (line after payment method line)
    if (paymentMethodFound) {
      let foundPaymentLine = false;
      for (const line of lines) {
        if (foundPaymentLine && line.trim() && !this.shouldSkipLine(line)) {
          description = line.trim();
          break;
        }

        if (paymentMethods.some(method => line.toUpperCase().includes(method))) {
          foundPaymentLine = true;
        }
      }
    }

    // Skip invalid transactions
    if (amount === 0 || !description || this.shouldSkipLine(description)) {
      return null;
    }

    // Convert date
    const monthMap: Record<string, string> = {
      'jan': '01', 'feb': '02', 'mar': '03', 'apr': '04',
      'may': '05', 'jun': '06', 'jul': '07', 'aug': '08',
      'sep': '09', 'oct': '10', 'nov': '11', 'dec': '12'
    };

    const monthNum = monthMap[month.toLowerCase()];
    const date = `${year}-${monthNum}-${day.padStart(2, '0')}`;

    return {
      date,
      description,
      amount,
      type: amount >= 0 ? 'income' : 'expense'
    };
  }

  /**
   * Group text items into lines based on Y coordinate
   */
  private static groupItemsByLines(items: TextItem[]): TextItem[][] {
    const lines: TextItem[][] = [];
    const sortedItems = [...items].sort((a, b) => b.y - a.y); // Top to bottom

    for (const item of sortedItems) {
      // Find line with similar Y coordinate (within 5 pixels)
      const existingLine = lines.find(line =>
        Math.abs(line[0].y - item.y) <= 5
      );

      if (existingLine) {
        existingLine.push(item);
      } else {
        lines.push([item]);
      }
    }

    // Sort items within each line by X coordinate (left to right)
    lines.forEach(line => line.sort((a, b) => a.x - b.x));

    return lines;
  }

  /**
   * Convert line items to text
   */
  private static lineToText(lineItems: TextItem[]): string {
    return lineItems.map(item => item.str).join(' ').trim();
  }

  /**
   * Check if line should be skipped
   */
  private static shouldSkipLine(line: string): boolean {
    const skipPatterns = [
      /balance/i,
      /deposits\s+\d+\s+pcs/i,
      /withdrawals\s+\d+\s+pcs/i,
      /^tr\.no\./i,
      /opening balance/i,
      /closing balance/i
    ];

    return skipPatterns.some(pattern => pattern.test(line));
  }
}