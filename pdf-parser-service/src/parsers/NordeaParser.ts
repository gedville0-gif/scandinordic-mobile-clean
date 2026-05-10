import { TextItem } from '../utils/pdfExtractor.js';

export interface Transaction {
  date: string;
  description: string;
  amount: number;
  type: 'income' | 'expense';
}

// Finnish number format: optional leading sign, digits with optional thousands sep (dot or space),
// comma decimal, optional trailing sign.  Examples: "9,96-"  "-3,65"  "1 420,46"  "1.087,98+"
const AMOUNT_RE = /^[-+]?\d{1,3}(?:[.\s]\d{3})*,\d{2}[-+]?$/;

// Transaction date: "DD.MM" or "DD.MM DD.MM" (entry + value date in one text item)
const DATE_RE = /^\d{1,2}\.\d{1,2}(\s+\d{1,2}\.\d{1,2})?$/;

export class NordeaParser {

  /**
   * Parse Nordea Bank PDF text items into transactions.
   *
   * Nordea statements appear in two column variants within the same PDF:
   *   - Single-amount:  DD.MM DD.MM  VENDOR  9,96-          (older pages)
   *   - Amount+Balance: DD.MM DD.MM  VENDOR  -1,79  1420,46  (newer pages)
   *
   * The fix: use X coordinates to detect when there are 2 numeric columns.
   * Second-from-right = Amount; rightmost = Balance (ignored).
   */
  static parse(items: TextItem[]): Transaction[] {
    console.log(`🏦 Starting Nordea parsing (${items.length} text items)`);

    const transactions: Transaction[] = [];
    const lines = this.groupItemsByLines(items);

    // Find year from a period date line (e.g. "01.01.2025 - 10.01.2025")
    let currentYear = new Date().getFullYear().toString();
    for (const line of lines) {
      const lineText = this.lineToText(line);
      const yearMatch =
        lineText.match(/Period:\s*\d{1,2}\.\d{1,2}\.(\d{4})/i) ||
        lineText.match(/\b(20\d{2})\b/);
      if (yearMatch) {
        currentYear = yearMatch[1];
        console.log(`📅 Found year: ${currentYear}`);
        break;
      }
    }

    let i = 0;
    while (i < lines.length) {
      const lineText = this.lineToText(lines[i]);

      // Transaction start: line begins with DD.MM (but NOT DD.MM.YYYY)
      if (/^\d{1,2}\.\d{1,2}(?!\.\d)(\s|$)/.test(lineText)) {
        // Collect TextItem[][] for the block until the next date line
        const blockLines: TextItem[][] = [];
        let j = i;

        while (j < lines.length) {
          const txt = this.lineToText(lines[j]);
          if (j > i && /^\d{1,2}\.\d{1,2}(?!\.\d)(\s|$)/.test(txt)) break;
          blockLines.push(lines[j]);
          j++;
          if (blockLines.length > 10) break;
        }

        const tx = this.parseTransactionBlock(blockLines, currentYear);
        if (tx) transactions.push(tx);
        i = j;
      } else {
        i++;
      }
    }

    console.log(`✅ Nordea parsing complete: ${transactions.length} transactions`);
    return transactions;
  }

  /**
   * Parse one transaction block using X coordinates to separate Amount from Balance.
   *
   * Nordea line layout (left→right):
   *   [Date item]  [Vendor words...]  [Amount]  [Balance — optional, rightmost]
   */
  private static parseTransactionBlock(blockLines: TextItem[][], year: string): Transaction | null {
    if (blockLines.length === 0) return null;

    const firstLine = blockLines[0];

    // ── 1. Find the date item ──────────────────────────────────────────────
    const dateItem = firstLine.find(item => DATE_RE.test(item.str));
    if (!dateItem) return null;

    const dateMatch = dateItem.str.match(/^(\d{1,2})\.(\d{1,2})/);
    if (!dateMatch) return null;

    const day   = dateMatch[1].padStart(2, '0');
    const month = dateMatch[2].padStart(2, '0');
    const date  = `${year}-${month}-${day}`;

    // ── 2. Find all numeric items sorted by X (left→right) ────────────────
    const numericItems = firstLine
      .filter(item => AMOUNT_RE.test(item.str))
      .sort((a, b) => a.x - b.x);

    if (numericItems.length === 0) return null;

    // 2+ numerics → second-from-right = Amount, rightmost = Balance (skip).
    // 1 numeric   → it is the Amount.
    const amountItem = numericItems.length >= 2
      ? numericItems[numericItems.length - 2]
      : numericItems[numericItems.length - 1];

    // ── 3. Parse the amount value and sign ────────────────────────────────
    const raw = amountItem.str;
    const hasLeadingMinus  = raw.startsWith('-');
    const hasTrailingMinus = raw.endsWith('-');

    const cleanAmount = raw
      .replace(/^[-+]/, '')          // remove leading sign
      .replace(/[-+]$/, '')          // remove trailing sign
      .replace(/[.\s](?=\d{3})/g, '') // remove thousands separators
      .replace(',', '.');             // comma → dot

    let amount = parseFloat(cleanAmount);
    if (!isFinite(amount) || amount === 0) return null;

    // Trailing "-" or leading "-" = expense (negative)
    if (hasLeadingMinus || hasTrailingMinus) {
      amount = -Math.abs(amount);
    } else {
      amount = Math.abs(amount);
    }

    // ── 4. Build vendor name (exclude date item and ALL numeric items) ─────
    const numericSet = new Set<TextItem>(numericItems);

    const vendor = firstLine
      .filter(item =>
        item !== dateItem &&
        !numericSet.has(item) &&
        !DATE_RE.test(item.str) &&
        item.str.trim().length > 1
      )
      .map(item => item.str.trim())
      .join(' ')
      .trim();

    if (!vendor || this.shouldSkipLine(vendor)) return null;

    return {
      date,
      description: vendor,
      amount,
      type: amount >= 0 ? 'income' : 'expense',
    };
  }

  private static groupItemsByLines(items: TextItem[]): TextItem[][] {
    const lines: TextItem[][] = [];
    const sortedItems = [...items].sort((a, b) => b.y - a.y);

    for (const item of sortedItems) {
      const existingLine = lines.find(line => Math.abs(line[0].y - item.y) <= 5);
      if (existingLine) {
        existingLine.push(item);
      } else {
        lines.push([item]);
      }
    }

    lines.forEach(line => line.sort((a, b) => a.x - b.x));
    return lines;
  }

  private static lineToText(lineItems: TextItem[]): string {
    return lineItems.map(item => item.str).join(' ').trim();
  }

  private static shouldSkipLine(vendor: string): boolean {
    return [
      /balance/i,
      /total deposits/i,
      /total withdrawals/i,
      /^tr\.no\./i,
      /opening balance/i,
      /closing balance/i,
    ].some(re => re.test(vendor));
  }
}
