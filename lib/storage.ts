import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { getCurrentUserId } from './session';
import type { Transaction, Invoice, Settings, OnboardingProfile, Worker, WorkSession } from './types';

async function getUid(): Promise<string | null> {
  const cached = getCurrentUserId();
  if (cached) return cached;
  // Fallback: called before AuthContext has set the cache (e.g. onboarding check)
  const { data: { session } } = await supabase.auth.getSession();
  return session?.user?.id ?? null;
}

// Used by lib/accountant.ts, lib/integrations.ts, and for settings/onboarding keys
export async function getUserScopedKey(base: string): Promise<string> {
  const userId = (await getUid()) ?? 'guest';
  return `@scandinordic/${userId}/${base}`;
}

export const DEFAULT_SETTINGS: Settings = {
  language: 'en',
  currency: 'EUR',
  darkMode: true,
  defaultVatPercent: 24,
};

// ─── Transactions ─────────────────────────────────────────────────────────────

export async function getTransactions(): Promise<Transaction[]> {
  const userId = await getUid();
  if (!userId) return [];
  const { data, error } = await supabase
    .from('transactions')
    .select('data')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) { console.error('[transactions] fetch failed:', error); return []; }
  return (data ?? []).map(row => row.data as Transaction);
}

export async function saveTransaction(t: Transaction): Promise<void> {
  const userId = await getUid();
  if (!userId) return;
  console.log('[transactions] upserting:', t);
  const { error } = await supabase
    .from('transactions')
    .upsert({ id: t.id, user_id: userId, data: t }, { onConflict: 'id' });
  if (error) console.error('[transactions] upsert failed:', error);
}

export async function deleteTransaction(id: string): Promise<void> {
  const userId = await getUid();
  if (!userId) return;
  const { error } = await supabase
    .from('transactions')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);
  if (error) console.error('[transactions] delete failed:', error);
}

// ─── Invoices ─────────────────────────────────────────────────────────────────

export async function getInvoices(): Promise<Invoice[]> {
  const userId = await getUid();
  if (!userId) return [];
  const { data, error } = await supabase
    .from('invoices')
    .select('data')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) { console.error('[invoices] fetch failed:', error); return []; }
  return (data ?? []).map(row => row.data as Invoice);
}

export async function saveInvoice(inv: Invoice): Promise<void> {
  const userId = await getUid();
  if (!userId) return;
  console.log('[invoices] upserting:', inv);
  const { error } = await supabase
    .from('invoices')
    .upsert({ id: inv.id, user_id: userId, data: inv }, { onConflict: 'id' });
  if (error) console.error('[invoices] upsert failed:', error);
}

export async function deleteInvoice(id: string): Promise<void> {
  const userId = await getUid();
  if (!userId) return;
  const { error } = await supabase
    .from('invoices')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);
  if (error) console.error('[invoices] delete failed:', error);
}

// ─── Settings (stays in AsyncStorage — device preference) ────────────────────

export async function getSettings(): Promise<Settings> {
  try {
    const raw = await AsyncStorage.getItem(await getUserScopedKey('settings'));
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(s: Partial<Settings>): Promise<void> {
  const key = await getUserScopedKey('settings');
  const raw = await AsyncStorage.getItem(key);
  const current: Settings = raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS;
  await AsyncStorage.setItem(key, JSON.stringify({ ...current, ...s }));
}

// ─── Onboarding (stays in AsyncStorage) ──────────────────────────────────────

export async function getOnboardingProfile(): Promise<OnboardingProfile | null> {
  try {
    const raw = await AsyncStorage.getItem(await getUserScopedKey('onboarding'));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function saveOnboardingProfile(profile: OnboardingProfile): Promise<void> {
  await AsyncStorage.setItem(await getUserScopedKey('onboarding'), JSON.stringify(profile));
}

export async function isOnboardingCompleted(): Promise<boolean> {
  const profile = await getOnboardingProfile();
  return profile?.onboarding_completed === true;
}

// ─── Workers ──────────────────────────────────────────────────────────────────

export async function getWorkers(): Promise<Worker[]> {
  const userId = await getUid();
  if (!userId) return [];
  const { data, error } = await supabase
    .from('workers')
    .select('data')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });
  if (error) { console.error('[workers] fetch failed:', error); return []; }
  return (data ?? []).map(row => row.data as Worker);
}

export async function saveWorker(w: Worker): Promise<void> {
  const userId = await getUid();
  if (!userId) return;
  console.log('[workers] upserting:', w);
  const { error } = await supabase
    .from('workers')
    .upsert({ id: w.id, user_id: userId, data: w }, { onConflict: 'id' });
  if (error) console.error('[workers] upsert failed:', error);
}

export async function deleteWorker(id: string): Promise<void> {
  const userId = await getUid();
  if (!userId) return;
  const { error } = await supabase
    .from('workers')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);
  if (error) console.error('[workers] delete failed:', error);
}

// ─── Work Sessions ────────────────────────────────────────────────────────────

export async function getWorkSessions(): Promise<WorkSession[]> {
  const userId = await getUid();
  if (!userId) return [];
  const { data, error } = await supabase
    .from('work_sessions')
    .select('data')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) { console.error('[work_sessions] fetch failed:', error); return []; }
  return (data ?? []).map(row => row.data as WorkSession);
}

export async function saveWorkSession(s: WorkSession): Promise<void> {
  const userId = await getUid();
  if (!userId) return;
  console.log('[work_sessions] upserting:', s);
  const { error } = await supabase
    .from('work_sessions')
    .upsert({ id: s.id, user_id: userId, data: s }, { onConflict: 'id' });
  if (error) console.error('[work_sessions] upsert failed:', error);
}

export async function deleteWorkSession(id: string): Promise<void> {
  const userId = await getUid();
  if (!userId) return;
  const { error } = await supabase
    .from('work_sessions')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);
  if (error) console.error('[work_sessions] delete failed:', error);
}

// ─── Seed demo data ───────────────────────────────────────────────────────────

export async function seedDemoData(): Promise<void> {
  const userId = await getUid();
  if (!userId) return;
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
  await supabase.from('transactions').insert(transactions.map(t => ({ id: t.id, user_id: userId, data: t })));

  const invoices: Invoice[] = [
    { id: 'i1', invoiceNumber: 'INV-001', clientName: 'Acme Corp', clientEmail: 'billing@acme.com', amount: 3200, vatAmount: 768, totalAmount: 3968, status: 'paid', issueDate: new Date(year, month, 1).toISOString(), dueDate: new Date(year, month, 31).toISOString(), currency: 'EUR' },
    { id: 'i2', invoiceNumber: 'INV-002', clientName: 'Nordic Solutions', clientEmail: 'finance@nordic.fi', amount: 1800, vatAmount: 432, totalAmount: 2232, status: 'sent', issueDate: new Date(year, month, 5).toISOString(), dueDate: new Date(year, month + 1, 5).toISOString(), currency: 'EUR' },
    { id: 'i3', invoiceNumber: 'INV-003', clientName: 'Svenska AB', amount: 2100, vatAmount: 504, totalAmount: 2604, status: 'draft', issueDate: new Date(year, month, 18).toISOString(), dueDate: new Date(year, month + 1, 18).toISOString(), currency: 'EUR' },
  ];
  await supabase.from('invoices').insert(invoices.map(i => ({ id: i.id, user_id: userId, data: i })));
}
