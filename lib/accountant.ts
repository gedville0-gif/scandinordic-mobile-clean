import AsyncStorage from '@react-native-async-storage/async-storage';
import { getUserScopedKey } from './storage';

export type AccountantPermission = 'view_only' | 'can_adjust' | 'can_finalize';
export type AccountantStatus = 'pending' | 'active' | 'revoked';

export interface AccountantInvite {
  id: string;
  email: string;
  name: string;
  permission: AccountantPermission;
  status: AccountantStatus;
  invitedAt: string;
  activatedAt?: string;
}

export const PERMISSION_LABEL: Record<AccountantPermission, string> = {
  view_only: 'View Only',
  can_adjust: 'Can Adjust',
  can_finalize: 'Can Finalize',
};

export async function getAccountants(): Promise<AccountantInvite[]> {
  try {
    const raw = await AsyncStorage.getItem(await getUserScopedKey('accountants'));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function saveAll(list: AccountantInvite[]): Promise<void> {
  await AsyncStorage.setItem(await getUserScopedKey('accountants'), JSON.stringify(list));
}

export async function inviteAccountant(
  email: string,
  name: string,
  permission: AccountantPermission,
): Promise<void> {
  const list = await getAccountants();
  list.push({
    id: Date.now().toString(),
    email: email.trim().toLowerCase(),
    name: name.trim(),
    permission,
    status: 'pending',
    invitedAt: new Date().toISOString(),
  });
  await saveAll(list);
}

export async function updateAccountantStatus(
  id: string,
  status: AccountantStatus,
): Promise<void> {
  const list = await getAccountants();
  const idx = list.findIndex(a => a.id === id);
  if (idx < 0) return;
  list[idx].status = status;
  if (status === 'active') list[idx].activatedAt = new Date().toISOString();
  await saveAll(list);
}

export async function removeAccountant(id: string): Promise<void> {
  const list = await getAccountants();
  await saveAll(list.filter(a => a.id !== id));
}
