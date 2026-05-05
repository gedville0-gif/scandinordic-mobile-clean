import AsyncStorage from '@react-native-async-storage/async-storage';
import { getUserScopedKey } from './storage';

export interface IntegrationDef {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: 'banking' | 'accounting' | 'payments';
  available: boolean;
}

export const INTEGRATIONS: IntegrationDef[] = [
  { id: 'nordea',      name: 'Nordea',      description: 'Import bank transactions automatically', icon: '🏦', category: 'banking',    available: false },
  { id: 'op',          name: 'OP Bank',      description: 'Sync income and expenses from OP',       icon: '🏛️', category: 'banking',    available: false },
  { id: 'holvi',       name: 'Holvi',        description: 'Business account built for freelancers', icon: '💳', category: 'banking',    available: false },
  { id: 'stripe',      name: 'Stripe',       description: 'Import Stripe payouts as income',        icon: '⚡', category: 'payments',   available: false },
  { id: 'paypal',      name: 'PayPal',       description: 'Sync PayPal transactions',               icon: '🅿️', category: 'payments',   available: false },
  { id: 'visma',       name: 'Visma',        description: 'Export reports to Visma',                icon: '📋', category: 'accounting', available: false },
  { id: 'procountor',  name: 'Procountor',   description: 'Send invoices to Procountor',            icon: '🗂️', category: 'accounting', available: false },
  { id: 'maventa',     name: 'Maventa',      description: 'Send e-invoices via Maventa',            icon: '📨', category: 'accounting', available: false },
];

export const CATEGORY_LABELS: Record<IntegrationDef['category'], string> = {
  banking:    'Banking',
  payments:   'Payments',
  accounting: 'Accounting',
};

export async function getConnectedIds(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(await getUserScopedKey('integrations'));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function connectIntegration(id: string): Promise<void> {
  const key = await getUserScopedKey('integrations');
  const ids = await getConnectedIds();
  if (!ids.includes(id)) {
    await AsyncStorage.setItem(key, JSON.stringify([...ids, id]));
  }
}

export async function disconnectIntegration(id: string): Promise<void> {
  const key = await getUserScopedKey('integrations');
  const ids = await getConnectedIds();
  await AsyncStorage.setItem(key, JSON.stringify(ids.filter(i => i !== id)));
}
