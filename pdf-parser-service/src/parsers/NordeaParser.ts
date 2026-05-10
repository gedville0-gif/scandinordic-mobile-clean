import { TextItem } from '../utils/pdfExtractor.js';

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
    console.log(`🏦 Starting Nordea parsing (${items.length} text items)`);

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

      // Updated regex: DD.MM at start, followed by space OR end of string
      // Avoid matching DD.MM.YYYY (which is the period header date format)
      const dateMatch = lineText.match(/^(\d{1,2}\.\d{1,2})(?!\.\d)(\s|$)/);

      if (dateMatch) {
        // Collect transaction block (all lines until next date or end)
        const transactionLines: string[] = [];
        let j = i;

        while (j < lines.length) {
          const currentLineText = this.lineToText(lines[j]);

          // Stop if we hit another date (but not the first one)
          if (j > i && /^\d{1,2}\.\d{1,2}(?!\.\d)(\s|$)/.test(currentLineText)) {
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
   * Parse a transaction block - Nordea uses single-line format:
   * "DD.MM DD.MM VENDOR AMOUNT[-]"
   * Where:
   *   - First date = entry date (booking)
   *   - Second date = value date
   *   - VENDOR = merchant/payee name
   *   - AMOUNT = European format (e.g. 9,96) with optional trailing minus for expenses
   */
  private static parseTransactionBlock(lines: string[], datePrefix: string, year: string): Transaction | null {
    if (lines.length === 0) return null;

    const firstLine = lines[0];

    // Match: DD.MM [DD.MM] VENDOR [SIGN]AMOUNT[SIGN]
    // Handles formats:
    //   "9,96-"       (trailing minus, no space)
    //   "9,96 -"      (trailing minus with space - separate text item)
    //   "1.087,98+"   (trailing plus with thousands separator)
    //   "-3,65"       (leading minus)
    //   "590,80"      (positive, no sign = income)
    //   "1 269,10"    (with space thousands separator)
    // CRITICAL: Trailing "-" means EXPENSE (negative). No sign = INCOME (positive).
    const txMatch = firstLine.match(
      /^(\d{1,2}\.\d{1,2})\s+(?:(\d{1,2}\.\d{1,2})\s+)?(.+?)\s+([-+]?\d+(?:[.\s]\d{3})*,\d{2})\s*([-+]?)$/
    );

    if (!txMatch) {
      return null;
    }

    const [, , , vendorPart, amountPart, signSuffix] = txMatch;
    let vendor = vendorPart.trim();

    // Skip balance/summary rows
    if (this.shouldSkipLine(vendor)) {
      return null;
    }

    // Parse amount - remove thousands separators (dot or space), convert comma to dot
    // Strip leading sign if any (we'll re-apply it)
    const hasLeadingMinus = amountPart.startsWith('-');
    const cleanAmount = amountPart
      .replace(/^[-+]/, '')           // Remove leading sign
      .replace(/[.\s](?=\d{3})/g, '') // Remove thousands separators
      .replace(',', '.');             // European decimal to dot
    let amount = parseFloat(cleanAmount);

    if (isNaN(amount) || amount === 0) return null;

    // SIGN DETECTION (Nordea convention):
    // - Trailing "-" (e.g. "9,96-") = EXPENSE (negative)
    // - Trailing "+" (e.g. "590,80+") = INCOME (positive, explicit)
    // - No trailing sign (e.g. "590,80") = INCOME (positive, default)
    // - Leading "-" (rare) = EXPENSE (negative)
    if (signSuffix === '-' || hasLeadingMinus) {
      amount = -Math.abs(amount); // Force negative for expenses
    } else {
      amount = Math.abs(amount); // Force positive for income (signSuffix is '+' or empty)
    }

    // Convert date to YYYY-MM-DD
    const [day, month] = datePrefix.split('.');
    const date = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;

    return {
      date,
      description: vendor,
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