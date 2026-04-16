import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Transaction, Invoice, Settings, OnboardingProfile, Worker, WorkSession } from './types';

const KEYS = {
  TRANSACTIONS: '@scandinordic/transactions',
  INVOICES: '@scandinordic/invoices',
  SETTINGS: '@scandinordic/settings',
  ONBOARDING: '@scandinordic/onboarding',
  WORKERS: '@scandinordic/workers',
  WORK_SESSIONS: '@scandinordic/work_sessions',
};

export const DEFAULT_SETTINGS: Settings = {
  language: 'en',
  currency: 'EUR',
  darkMode: true,
  defaultVatPercent: 24,
};

// Transactions
export async function getTransactions(): Promise<Transaction[]> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.TRANSACTIONS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function saveTransaction(t: Transaction): Promise<void> {
  const all = await getTransactions();
  const idx = all.findIndex(x => x.id === t.id);
  if (idx >= 0) all[idx] = t;
  else all.unshift(t);
  await AsyncStorage.setItem(KEYS.TRANSACTIONS, JSON.stringify(all));
}

export async function deleteTransaction(id: string): Promise<void> {
  const all = await getTransactions();
  await AsyncStorage.setItem(KEYS.TRANSACTIONS, JSON.stringify(all.filter(x => x.id !== id)));
}

// Invoices
export async function getInvoices(): Promise<Invoice[]> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.INVOICES);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function saveInvoice(inv: Invoice): Promise<void> {
  const all = await getInvoices();
  const idx = all.findIndex(x => x.id === inv.id);
  if (idx >= 0) all[idx] = inv;
  else all.unshift(inv);
  await AsyncStorage.setItem(KEYS.INVOICES, JSON.stringify(all));
}

export async function deleteInvoice(id: string): Promise<void> {
  const all = await getInvoices();
  await AsyncStorage.setItem(KEYS.INVOICES, JSON.stringify(all.filter(x => x.id !== id)));
}

// Settings
export async function getSettings(): Promise<Settings> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.SETTINGS);
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(s: Partial<Settings>): Promise<void> {
  const current = await getSettings();
  await AsyncStorage.setItem(KEYS.SETTINGS, JSON.stringify({ ...current, ...s }));
}

// Onboarding
export async function getOnboardingProfile(): Promise<OnboardingProfile | null> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.ONBOARDING);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function saveOnboardingProfile(profile: OnboardingProfile): Promise<void> {
  await AsyncStorage.setItem(KEYS.ONBOARDING, JSON.stringify(profile));
}

export async function isOnboardingCompleted(): Promise<boolean> {
  const profile = await getOnboardingProfile();
  return profile?.onboarding_completed === true;
}

// Workers
export async function getWorkers(): Promise<Worker[]> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.WORKERS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function saveWorker(w: Worker): Promise<void> {
  const all = await getWorkers();
  const idx = all.findIndex(x => x.id === w.id);
  if (idx >= 0) all[idx] = w;
  else all.push(w);
  await AsyncStorage.setItem(KEYS.WORKERS, JSON.stringify(all));
}

export async function deleteWorker(id: string): Promise<void> {
  const all = await getWorkers();
  await AsyncStorage.setItem(KEYS.WORKERS, JSON.stringify(all.filter(x => x.id !== id)));
}

// Work Sessions
export async function getWorkSessions(): Promise<WorkSession[]> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.WORK_SESSIONS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function saveWorkSession(s: WorkSession): Promise<void> {
  const all = await getWorkSessions();
  const idx = all.findIndex(x => x.id === s.id);
  if (idx >= 0) all[idx] = s;
  else all.unshift(s);
  await AsyncStorage.setItem(KEYS.WORK_SESSIONS, JSON.stringify(all));
}

export async function deleteWorkSession(id: string): Promise<void> {
  const all = await getWorkSessions();
  await AsyncStorage.setItem(KEYS.WORK_SESSIONS, JSON.stringify(all.filter(x => x.id !== id)));
}

// Seed demo data
export async function seedDemoData(): Promise<void> {
  const existing = await getTransactions();
  if (existing.length > 0) return;

  const now = new Date();
  const month = now.getMonth();
  const year = now.getFullYear();

  const transactions: Transaction[] = [
    { id: '1', type: 'income', amount: 3200, description: 'Website Design Project', category: 'Consulting', date: new Date(year, month, 3).toISOString(), vatRate: 24 },
    { id: '2', type: 'income', amount: 1800, description: 'Monthly Retainer - Acme Corp', category: 'Consulting', date: new Date(year, month, 7).toISOString(), vatRate: 24 },
    { id: '3', type: 'expense', amount: 299, description: 'Adobe Creative Cloud', category: 'Software', date: new Date(year, month, 5).toISOString(), vatRate: 24 },
    { id: '4', type: 'expense', amount: 85, description: 'Office Supplies', category: 'Office', date: new Date(year, month, 8).toISOString(), vatRate: 24 },
    { id: '5', type: 'income', amount: 750, description: 'Copywriting - Blog Posts', category: 'Writing', date: new Date(year, month, 12).toISOString(), vatRate: 24 },
    { id: '6', type: 'expense', amount: 420, description: 'Business Travel', category: 'Travel', date: new Date(year, month, 14).toISOString(), vatRate: 24 },
    { id: '7', type: 'income', amount: 2100, description: 'App Development Sprint', category: 'Development', date: new Date(year, month, 18).toISOString(), vatRate: 24 },
    { id: '8', type: 'expense', amount: 150, description: 'Cloud Hosting', category: 'Software', date: new Date(year, month, 20).toISOString(), vatRate: 24 },
  ];

  await AsyncStorage.setItem(KEYS.TRANSACTIONS, JSON.stringify(transactions));

  const invoices: Invoice[] = [
    { id: 'i1', invoiceNumber: 'INV-001', clientName: 'Acme Corp', clientEmail: 'billing@acme.com', amount: 3200, vatAmount: 768, totalAmount: 3968, status: 'paid', issueDate: new Date(year, month, 1).toISOString(), dueDate: new Date(year, month, 31).toISOString(), currency: 'EUR' },
    { id: 'i2', invoiceNumber: 'INV-002', clientName: 'Nordic Solutions', clientEmail: 'finance@nordic.fi', amount: 1800, vatAmount: 432, totalAmount: 2232, status: 'sent', issueDate: new Date(year, month, 5).toISOString(), dueDate: new Date(year, month + 1, 5).toISOString(), currency: 'EUR' },
    { id: 'i3', invoiceNumber: 'INV-003', clientName: 'Svenska AB', amount: 2100, vatAmount: 504, totalAmount: 2604, status: 'draft', issueDate: new Date(year, month, 18).toISOString(), dueDate: new Date(year, month + 1, 18).toISOString(), currency: 'EUR' },
  ];

  await AsyncStorage.setItem(KEYS.INVOICES, JSON.stringify(invoices));
}
