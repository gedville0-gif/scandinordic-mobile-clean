import { supabase } from './supabase';
import { getCurrentUserId } from './session';

export interface AccountantInviteRow {
  id: string;
  inviter_user_id: string;
  accountant_email: string;
  status: string;
  created_at: string;
  accepted_at: string | null;
}

export async function sendAccountantInvite(email: string): Promise<void> {
  const userId = getCurrentUserId();
  if (!userId) throw new Error('Not signed in');
  const trimmed = email.trim().toLowerCase();
  if (!trimmed.includes('@')) throw new Error('Invalid email');
  const { error } = await supabase
    .from('accountant_invites')
    .insert({ inviter_user_id: userId, accountant_email: trimmed });
  if (error) throw error;
}

export async function getMyAccountants(): Promise<AccountantInviteRow[]> {
  const userId = getCurrentUserId();
  if (!userId) return [];
  const { data, error } = await supabase
    .from('accountant_invites')
    .select('*')
    .eq('inviter_user_id', userId)
    .eq('status', 'accepted')
    .order('accepted_at', { ascending: false });
  if (error) {
    console.error('[accountant-invites] fetch failed:', error.message);
    return [];
  }
  return (data ?? []) as AccountantInviteRow[];
}

export async function removeAccountant(id: string): Promise<void> {
  const userId = getCurrentUserId();
  if (!userId) throw new Error('Not signed in');
  const { error } = await supabase
    .from('accountant_invites')
    .delete()
    .eq('id', id)
    .eq('inviter_user_id', userId);
  if (error) throw error;
}
