import type { Cents } from './money';

export type TransactionType = 'income' | 'expense';

export interface Transaction {
  id: string;
  type: TransactionType;
  amountCents: Cents;
  description: string;
  category: string;
  veroCategory?: string;
  date: string;
  vatRate?: number;
  vatRows?: { vatRate: number; grossAmountCents: Cents }[];
  notes?: string;
  clientName?: string;
  status?: 'paid' | 'unpaid';
  note?: string;
  receipt_url?: string;
}

export interface InvoiceLineItem {
  id: string;
  description: string;
  period?: string;
  quantity: number;
  unit: string;
  unitPriceCents: Cents;
  vatPercent: number;
  vatIncluded?: boolean;
  // Replaces the old `discount: string` antipattern. Use at most one:
  //   discountPercent: 0..100 (percentage off pre-tax line)
  //   discountAmountCents: fixed-value discount in cents
  discountPercent?: number;
  discountAmountCents?: Cents;
  lineTotalCents: Cents;
  lineVatAmountCents: Cents;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  // FROM (seller)
  fromName?: string;
  fromAddress?: string;
  fromBusinessId?: string;
  fromVatNumber?: string;
  fromEmail?: string;
  fromPhone?: string;
  fromIban?: string;
  fromBic?: string;
  // BILL TO (client)
  clientName: string;
  clientCompanyName?: string;
  clientCompanyId?: string;
  clientVatId?: string;
  clientAddress?: string;
  clientCity?: string;
  clientPostalCode?: string;
  clientCountry?: string;
  clientEmail?: string;
  clientPhone?: string;
  // Invoice details
  issueDate: string;
  dueDate: string;
  referenceNumber?: string;
  paymentTerms?: string;
  vatIncluded?: boolean;
  // Line items
  lineItems?: InvoiceLineItem[];
  // Totals
  amountCents: Cents;
  vatAmountCents: Cents;
  totalAmountCents: Cents;
  // Meta
  status: 'draft' | 'sent' | 'paid' | 'overdue';
  currency: string;
  additionalInfo?: string;
  description?: string;
}

export interface Worker {
  id: string;
  name: string;
  categoryId: string;
  hourlyRateCents: Cents;
  createdAt: string;
}

export interface WorkSession {
  id: string;
  workerId: string;
  startTime: string;
  endTime?: string;
  durationHours?: number;
  note?: string;
  date: string;
}

export type Language = 'en' | 'fi' | 'sv' | 'da';
export type Currency = 'EUR' | 'SEK' | 'DKK' | 'NOK';

export interface Settings {
  language: Language;
  currency: Currency;
  darkMode: boolean;
  companyName?: string;
  companyId?: string;
  vatNumber?: string;
  address?: string;
  city?: string;
  postalCode?: string;
  country?: string;
  email?: string;
  phone?: string;
  iban?: string;
  bic?: string;
  defaultVatPercent?: number;
}

export interface OnboardingProfile {
  profession: string;
  features: Record<string, 'key' | 'enabled' | 'hidden'>;
  onboarding_completed: boolean;
  completed_at: string;
}
