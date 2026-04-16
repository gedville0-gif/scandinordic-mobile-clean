import type { Currency } from './types';

const CURRENCY_SYMBOLS: Record<Currency, string> = {
  EUR: '€',
  SEK: 'kr',
  DKK: 'kr.',
  NOK: 'kr',
};

export function formatCurrency(amount: number, currency: Currency = 'EUR'): string {
  const sym = CURRENCY_SYMBOLS[currency];
  const formatted = Math.abs(amount).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (currency === 'EUR') return `${sym}${formatted}`;
  return `${formatted} ${sym}`;
}

export function formatCompact(amount: number, currency: Currency = 'EUR'): string {
  const sym = CURRENCY_SYMBOLS[currency];
  if (Math.abs(amount) >= 1000) {
    const k = (amount / 1000).toFixed(1);
    if (currency === 'EUR') return `${sym}${k}k`;
    return `${k}k ${sym}`;
  }
  return formatCurrency(amount, currency);
}
