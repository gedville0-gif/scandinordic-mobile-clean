import { TextItem } from '../utils/pdfExtractor';

export interface Transaction {
  date: string;
  description: string;
  amount: number;
  type: 'income' | 'expense';
}

export class NordeaParser {

  /**
   * Parse Nordea Bank PDF text items into transactions
   */
  static parse(items: TextItem[]): Transaction[] {
    console.log('🏦 Starting Nordea parsing...');

    const transactions: Transaction[] = [];
    const lines = this.groupItemsByLines(items);

    // Find year from period header (e.g. "Period: 01.09.2025 - 30.09.2025")
    let currentYear = new Date().getFullYear().toString();
    for (const line of lines) {
      const lineText = this.lineToText(line);
      const periodMatch = lineText.match(/Period:\s*\d{1,2}\.\d{1,2}\.(\d{4})/i);
      if (periodMatch) {
        currentYear = periodMatch[1];
        console.log(`📅 Found year in period: ${currentYear}`);
        break;
      }
    }

    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      const lineText = this.lineToText(line);

      // Check for Nordea date pattern: "DD.MM" at start of line
      const dateMatch = lineText.match(/^(\d{1,2}\.\d{1,2})\s/);

      if (dateMatch) {
        console.log(`📅 Found date line: ${lineText}`);

        // Collect transaction block (all lines until next date or end)
        const transactionLines: string[] = [];
        let j = i;

        while (j < lines.length) {
          const currentLineText = this.lineToText(lines[j]);

          // Stop if we hit another date (but not the first one)
          if (j > i && currentLineText.match(/^\d{1,2}\.\d{1,2}\s/)) {
            break;
          }

          transactionLines.push(currentLineText);
          j++;
        }

        // Parse the collected transaction block
        const transaction = this.parseTransactionBlock(transactionLines, dateMatch[1], currentYear);
        if (transaction) {
          transactions.push(transaction);
        }

        i = j;
      } else {
        i++;
      }
    }

    console.log(`✅ Nordea parsing complete: ${transactions.length} transactions`);
    return transactions;
  }

  /**
   * Parse a transaction block (multiple lines for one transaction)
   */
  private static parseTransactionBlock(lines: string[], datePrefix: string, year: string): Transaction | null {
    if (lines.length < 2) return null;

    // Line 1: Date + Description (remove date prefix to get description)
    const description = lines[0].replace(/^\d{1,2}\.\d{1,2}\s+/, '').trim();

    // Line 2: Payment method
    const paymentMethod = lines.length > 1 ? lines[1].trim() : '';

    // Last line: Amount in European format (-3,39 or 590,80)
    const lastLine = lines[lines.length - 1];
    const amountMatch = lastLine.match(/([-+]?\d+,\d{2})(?:\s*€)?$/);

    if (!amountMatch || !description || this.shouldSkipLine(description)) {
      return null;
    }

    // Parse amount (convert comma to dot)
    const amountStr = amountMatch[1].replace(',', '.');
    const amount = parseFloat(amountStr);

    if (amount === 0) return null;

    // Convert date DD.MM.YYYY
    const fullDate = `${datePrefix}.${year}`;
    const [day, month] = datePrefix.split('.');
    const date = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;

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
      /total deposits/i,
      /total withdrawals/i,
      /^tr\.no\./i,
      /opening balance/i,
      /closing balance/i
    ];

    return skipPatterns.some(pattern => pattern.test(line));
  }
}