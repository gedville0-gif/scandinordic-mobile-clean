/**
 * Money handling for Scandinordic Pro.
 *
 * All money in this app is stored and computed as integer cents (1 cent = €0.01).
 * Never use a raw `number` for currency — use the `Cents` branded type defined here.
 *
 * Why: IEEE 754 floats lose precision. `0.1 + 0.2 === 0.30000000000000004`.
 * Integer cents avoid this entirely. Stripe, ECB, and most accounting systems
 * use the same convention.
 *
 * Range: JS Number.MAX_SAFE_INTEGER (~9 × 10^15) gives ~90 trillion euros of
 * safe headroom in cents. Beyond Scandinordic's TAM for the next century.
 */

import type { Currency, Language } from './types';

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Branded integer cents. Structurally a number, but TypeScript treats it as a
 * distinct type so a raw `number` (euros, percentages, or anything else) cannot
 * be passed where cents are expected.
 *
 * Always create via `toCents`, `parseCents`, `fromMinorUnit`, or `zeroCents`.
 * Never construct directly outside this module.
 */
export type Cents = number & { readonly __brand: 'Cents' };

// ─── Locale config ────────────────────────────────────────────────────────────

const LOCALE_BCP47: Record<Language, string> = {
  fi: 'fi-FI',
  sv: 'sv-SE',
  da: 'da-DK',
  en: 'en-US',
};

const DEFAULT_LOCALE: Language = 'en';
const DEFAULT_CURRENCY: Currency = 'EUR';

// ─── Internal helpers ─────────────────────────────────────────────────────────

const assertFiniteNumber = (n: unknown, context: string): void => {
  if (typeof n !== 'number' || !Number.isFinite(n)) {
    throw new TypeError(
      `Money: ${context} must be a finite number, got ${String(n)}`,
    );
  }
};

// ─── Constructors ─────────────────────────────────────────────────────────────

/**
 * Convert a euro amount (with optional fractional cents) to integer cents.
 * Rounds half toward +Infinity (standard `Math.round` semantics — matches
 * Finnish ALV rounding rules for positive amounts).
 *
 * Throws on NaN/Infinity.
 *
 * @example toCents(19.99) === 1999 as Cents
 * @example toCents(0.1 + 0.2) === 30 as Cents  // not 30.000000…
 */
export const toCents = (euros: number): Cents => {
  assertFiniteNumber(euros, 'toCents input');
  return Math.round(euros * 100) as Cents;
};

/**
 * Brand a known-integer-cents number (e.g. from Stripe webhook, a Supabase
 * `bigint` column, or our own `compute-invoice-totals` edge function).
 * Throws if the input isn't a finite integer.
 */
export const fromMinorUnit = (cents: number): Cents => {
  assertFiniteNumber(cents, 'fromMinorUnit input');
  if (!Number.isInteger(cents)) {
    throw new TypeError(
      `Money: fromMinorUnit requires an integer, got ${cents}`,
    );
  }
  return cents as Cents;
};

/** Zero cents — safe to use as initial accumulator in `reduce`. */
export const zeroCents = (): Cents => 0 as Cents;

// ─── Parsing ──────────────────────────────────────────────────────────────────

/**
 * Parse a user-typed or OCR'd money string into integer cents.
 *
 * Handles locale variations (Finnish/Swedish/Danish `1 234,56`, English
 * `1,234.56`), currency symbols (€, $, £, kr), and stray whitespace.
 *
 * Heuristic: the last comma or period is the decimal separator IF the trailing
 * group is 1–2 digits; otherwise treated as a thousands separator and stripped.
 *
 * Note: ambiguous inputs like "1,234" (= 1234 in English, malformed in Finnish)
 * resolve to thousands-separator semantics because the trailing group is 3+
 * digits. Inputs with more than 2 decimal digits ("0.005") are not supported
 * and may produce unexpected results — callers should validate UI input.
 *
 * @param input  raw user/OCR string
 * @param locale  reserved for future locale-strict parsing (currently unused)
 * @returns Cents on success, null on parse failure
 */
export const parseCents = (
  input: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  locale?: Language,
): Cents | null => {
  if (typeof input !== 'string') return null;

  let s = input.trim().replace(/[€$£]/g, '').replace(/\bkr\b/gi, '').replace(/\s+/g, '');
  if (!s) return null;

  const negative = s.startsWith('-');
  if (negative || s.startsWith('+')) s = s.slice(1);

  s = s.replace(/[^\d,.]/g, '');
  if (!s) return null;

  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  const lastSep = Math.max(lastComma, lastDot);

  let normalized: string;
  if (lastSep === -1) {
    normalized = s;
  } else {
    const trailing = s.slice(lastSep + 1);
    if (trailing.length >= 1 && trailing.length <= 2 && /^\d+$/.test(trailing)) {
      const wholePart = s.slice(0, lastSep).replace(/[,.]/g, '');
      const fracPart = trailing.padEnd(2, '0');
      normalized = `${wholePart || '0'}.${fracPart}`;
    } else {
      normalized = s.replace(/[,.]/g, '');
    }
  }

  const euros = parseFloat(normalized);
  if (!Number.isFinite(euros)) return null;

  const cents = Math.round(euros * 100);
  return (negative ? -cents : cents) as Cents;
};

// ─── Formatting ───────────────────────────────────────────────────────────────

/**
 * Format integer cents as a localized currency string using `Intl.NumberFormat`.
 *
 * @example formatCents(1999 as Cents, 'EUR', 'fi') === '19,99 €'
 * @example formatCents(1999 as Cents, 'EUR', 'en') === '€19.99'
 */
export const formatCents = (
  cents: Cents,
  currency: Currency = DEFAULT_CURRENCY,
  locale: Language = DEFAULT_LOCALE,
): string => {
  const euros = cents / 100;
  try {
    return new Intl.NumberFormat(LOCALE_BCP47[locale], {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(euros);
  } catch {
    return `${euros.toFixed(2)} ${currency}`;
  }
};

/**
 * Format cents as a plain decimal string with no currency symbol or grouping.
 * Always uses `.` as the decimal separator — for CSV export, form input values,
 * and JSON serialization in contexts that don't need localization.
 *
 * @example formatCentsPlain(1999 as Cents) === '19.99'
 * @example formatCentsPlain(-1 as Cents) === '-0.01'
 */
export const formatCentsPlain = (cents: Cents): string => {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100);
  const frac = (abs % 100).toString().padStart(2, '0');
  return `${sign}${whole}.${frac}`;
};

// ─── Arithmetic ───────────────────────────────────────────────────────────────

/** a + b. Integer arithmetic — no precision loss. */
export const addCents = (a: Cents, b: Cents): Cents => (a + b) as Cents;

/** a - b. */
export const subtractCents = (a: Cents, b: Cents): Cents => (a - b) as Cents;

/** Negate (refunds, credit notes, expense vs income inversion). */
export const negateCents = (c: Cents): Cents => -c as Cents;

/** Absolute value. */
export const absCents = (c: Cents): Cents => Math.abs(c) as Cents;

/**
 * Multiply cents by a unitless factor (e.g. quantity, VAT rate as fraction).
 * Result rounded to integer cents (round half toward +Infinity).
 *
 * @example multiplyCents(1999 as Cents, 3) === 5997 as Cents
 * @example multiplyCents(1000 as Cents, 0.255) === 255 as Cents  // 25.5% VAT
 */
export const multiplyCents = (cents: Cents, factor: number): Cents => {
  assertFiniteNumber(factor, 'multiplyCents factor');
  return Math.round(cents * factor) as Cents;
};

/**
 * Divide cents by a divisor (e.g. splitting a bill N ways). Throws on zero.
 * Rounds to nearest cent — callers needing exact splits should distribute the
 * rounding residual to one party explicitly.
 */
export const divideCents = (cents: Cents, divisor: number): Cents => {
  assertFiniteNumber(divisor, 'divideCents divisor');
  if (divisor === 0) throw new RangeError('Money: divideCents by zero');
  return Math.round(cents / divisor) as Cents;
};

/** Sum an array of cents (line totals → subtotal, monthly sums, etc.). */
export const sumCents = (values: Cents[]): Cents =>
  values.reduce((acc, v) => (acc + v) as Cents, zeroCents());

// ─── Comparison ───────────────────────────────────────────────────────────────

export const isZeroCents = (c: Cents): boolean => c === 0;
export const isPositiveCents = (c: Cents): boolean => c > 0;
export const isNegativeCents = (c: Cents): boolean => c < 0;

/** Returns -1, 0, or 1. Useful for `Array.prototype.sort`. */
export const compareCents = (a: Cents, b: Cents): -1 | 0 | 1 =>
  a < b ? -1 : a > b ? 1 : 0;

// ─── VAT helpers ──────────────────────────────────────────────────────────────

/**
 * Compute VAT components when the GROSS (VAT-inclusive) amount is known.
 * Used for receipt scanning and bank-statement imports where only the final
 * paid amount is observed.
 *
 * Math: net = round(gross / (1 + vatPct/100)); vat = gross - net.
 *
 * @example computeVatFromGross(1000 as Cents, 25.5)
 *          → { net: 797 as Cents, vat: 203 as Cents }
 */
export const computeVatFromGross = (
  gross: Cents,
  vatPercent: number,
): { net: Cents; vat: Cents } => {
  assertFiniteNumber(vatPercent, 'computeVatFromGross vatPercent');
  if (vatPercent < 0) throw new RangeError('Money: VAT percent must be ≥ 0');
  const net = Math.round(gross / (1 + vatPercent / 100)) as Cents;
  const vat = (gross - net) as Cents;
  return { net, vat };
};

/**
 * Compute VAT components when the NET (VAT-exclusive) amount is known.
 * Used for invoice line items where the seller enters a pre-tax price.
 *
 * Math: vat = round(net × vatPct/100); gross = net + vat.
 *
 * @example computeVatFromNet(1000 as Cents, 25.5)
 *          → { vat: 255 as Cents, gross: 1255 as Cents }
 */
export const computeVatFromNet = (
  net: Cents,
  vatPercent: number,
): { vat: Cents; gross: Cents } => {
  assertFiniteNumber(vatPercent, 'computeVatFromNet vatPercent');
  if (vatPercent < 0) throw new RangeError('Money: VAT percent must be ≥ 0');
  const vat = Math.round((net * vatPercent) / 100) as Cents;
  const gross = (net + vat) as Cents;
  return { vat, gross };
};
