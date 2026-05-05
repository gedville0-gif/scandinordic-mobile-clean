import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, Pressable, TextInput, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { COLORS } from '@/constants/colors';
import {
  getAccountants, inviteAccountant, updateAccountantStatus, removeAccountant,
  PERMISSION_LABEL,
  type AccountantInvite, type AccountantPermission,
} from '@/lib/accountant';
import { useLanguage } from '@/contexts/LanguageContext';

const PERMISSION_OPTIONS: { id: AccountantPermission; label: string; desc: string }[] = [
  { id: 'view_only',    label: 'View Only',    desc: 'Can view all reports, no changes' },
  { id: 'can_adjust',   label: 'Can Adjust',   desc: 'Can add adjustments with notes' },
  { id: 'can_finalize', label: 'Can Finalize', desc: 'Full access: adjust, review, finalize' },
];

export default function AccountantAccessScreen() {
  const s = makeStyles();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();

  const [accountants, setAccountants] = useState<AccountantInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [permission, setPermission] = useState<AccountantPermission>('can_adjust');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const list = await getAccountants();
    setAccountants(list);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const activeCount  = accountants.filter(a => a.status === 'active').length;
  const pendingCount = accountants.filter(a => a.status === 'pending').length;

  const handleInvite = async () => {
    if (!email.trim()) { setError('Email is required'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setError('Enter a valid email'); return; }
    if (accountants.some(a => a.email === email.trim().toLowerCase() && a.status !== 'revoked')) {
      setError('This email already has access'); return;
    }
    setSaving(true);
    try {
      await inviteAccountant(email, name || email.split('@')[0], permission);
      setEmail(''); setName(''); setError(''); setShowForm(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await load();
    } finally {
      setSaving(false);
    }
  };

  const handleActivate = async (id: string) => {
    await updateAccountantStatus(id, 'active');
    Haptics.selectionAsync();
    await load();
  };

  const handleRevoke = async (id: string) => {
    await updateAccountantStatus(id, 'revoked');
    Haptics.selectionAsync();
    await load();
  };

  const handleRemove = async (id: string) => {
    await removeAccountant(id);
    Haptics.selectionAsync();
    await load();
  };

  const statusColor = (status: AccountantInvite['status']) => {
    if (status === 'active')  return COLORS.success;
    if (status === 'revoked') return COLORS.danger;
    return COLORS.warning;
  };

  const permColor = (p: AccountantPermission) => {
    if (p === 'view_only')    return COLORS.info;
    if (p === 'can_finalize') return COLORS.success;
    return COLORS.warning;
  };

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={COLORS.primary} />
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: COLORS.background }}
      contentContainerStyle={[s.content, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 40 }]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {/* Header */}
      <Text style={s.badge}>◆ ScandiNordic Pro ◆</Text>
      <View style={s.titleRow}>
        <Pressable
          style={({ pressed }) => [s.backBtn, pressed && { opacity: 0.65 }]}
          onPress={() => router.back()}
        >
          <Feather name="arrow-left" size={18} color={COLORS.text} />
        </Pressable>
        <Text style={s.title}>Accountant Access</Text>
        <Text style={s.lockIcon}>🔐</Text>
      </View>
      <View style={s.divider} />

      {/* Stats */}
      <View style={s.statsRow}>
        {[
          { label: 'Total',   value: accountants.length, color: COLORS.text },
          { label: 'Active',  value: activeCount,         color: COLORS.success },
          { label: 'Pending', value: pendingCount,        color: COLORS.warning },
        ].map(stat => (
          <View key={stat.label} style={s.statCard}>
            <Text style={[s.statValue, { color: stat.color }]}>{stat.value}</Text>
            <Text style={s.statLabel}>{stat.label.toUpperCase()}</Text>
          </View>
        ))}
      </View>

      {/* Invite button / form */}
      {!showForm ? (
        <Pressable
          style={({ pressed }) => [s.inviteBtn, pressed && { opacity: 0.65 }]}
          onPress={() => { Haptics.selectionAsync(); setShowForm(true); }}
        >
          <Feather name="plus" size={14} color={COLORS.primary} />
          <Text style={s.inviteBtnText}>Invite Accountant</Text>
        </Pressable>
      ) : (
        <View style={s.formCard}>
          <Text style={s.formTitle}>NEW ACCOUNTANT INVITE</Text>

          <Text style={s.fieldLabel}>EMAIL *</Text>
          <TextInput
            style={s.input}
            value={email}
            onChangeText={v => { setEmail(v); setError(''); }}
            placeholder="accountant@firm.fi"
            placeholderTextColor={COLORS.muted}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Text style={[s.fieldLabel, { marginTop: 10 }]}>NAME</Text>
          <TextInput
            style={s.input}
            value={name}
            onChangeText={setName}
            placeholder="Accountant name"
            placeholderTextColor={COLORS.muted}
          />

          <Text style={[s.fieldLabel, { marginTop: 10, marginBottom: 8 }]}>PERMISSION LEVEL</Text>
          {PERMISSION_OPTIONS.map(opt => (
            <Pressable
              key={opt.id}
              style={({ pressed }) => [
                s.permOption,
                permission === opt.id && s.permOptionActive,
                pressed && { opacity: 0.8 },
              ]}
              onPress={() => { Haptics.selectionAsync(); setPermission(opt.id); }}
            >
              <View style={[s.radio, permission === opt.id && s.radioActive]} />
              <View style={{ flex: 1 }}>
                <Text style={s.permLabel}>{opt.label}</Text>
                <Text style={s.permDesc}>{opt.desc}</Text>
              </View>
            </Pressable>
          ))}

          {!!error && <Text style={s.errorText}>{error}</Text>}

          <View style={s.formActions}>
            <Pressable
              style={({ pressed }) => [s.cancelBtn, pressed && { opacity: 0.65 }]}
              onPress={() => { setShowForm(false); setEmail(''); setName(''); setError(''); }}
            >
              <Text style={s.cancelBtnText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [s.sendBtn, pressed && { opacity: 0.65 }]}
              onPress={handleInvite}
              disabled={saving}
            >
              {saving
                ? <ActivityIndicator size="small" color={COLORS.background} />
                : <Text style={s.sendBtnText}>Send Invite</Text>}
            </Pressable>
          </View>
        </View>
      )}

      {/* Accountant list */}
      <Text style={s.sectionLabel}>ACCOUNTANTS ({accountants.length})</Text>
      {accountants.length === 0 ? (
        <View style={s.emptyCard}>
          <Text style={s.emptyIcon}>👤</Text>
          <Text style={s.emptyText}>No accountants invited yet</Text>
          <Text style={s.emptyHint}>Invite an accountant to allow report access</Text>
        </View>
      ) : (
        accountants.map(a => (
          <View key={a.id} style={s.accountantCard}>
            <View style={s.accountantTop}>
              <View style={{ flex: 1 }}>
                <View style={s.accountantNameRow}>
                  <Text style={s.accountantName}>{a.name}</Text>
                  <View style={[s.badge2, { borderColor: statusColor(a.status) + '50', backgroundColor: statusColor(a.status) + '18' }]}>
                    <Text style={[s.badge2Text, { color: statusColor(a.status) }]}>{a.status.toUpperCase()}</Text>
                  </View>
                </View>
                <Text style={s.accountantEmail}>{a.email}</Text>
                <View style={[s.badge2, { marginTop: 6, alignSelf: 'flex-start', borderColor: permColor(a.permission) + '50', backgroundColor: permColor(a.permission) + '18' }]}>
                  <Text style={[s.badge2Text, { color: permColor(a.permission) }]}>{PERMISSION_LABEL[a.permission].toUpperCase()}</Text>
                </View>
              </View>
              <View style={s.accountantActions}>
                {a.status === 'pending' && (
                  <Pressable
                    style={({ pressed }) => [s.actionBtn, s.actionBtnGreen, pressed && { opacity: 0.65 }]}
                    onPress={() => handleActivate(a.id)}
                  >
                    <Text style={[s.actionBtnText, { color: COLORS.success }]}>Activate</Text>
                  </Pressable>
                )}
                {a.status === 'active' && (
                  <Pressable
                    style={({ pressed }) => [s.actionBtn, s.actionBtnRed, pressed && { opacity: 0.65 }]}
                    onPress={() => handleRevoke(a.id)}
                  >
                    <Text style={[s.actionBtnText, { color: COLORS.danger }]}>Revoke</Text>
                  </Pressable>
                )}
                <Pressable
                  style={({ pressed }) => [s.actionBtn, pressed && { opacity: 0.65 }]}
                  onPress={() => handleRemove(a.id)}
                >
                  <Text style={[s.actionBtnText, { color: COLORS.muted }]}>Remove</Text>
                </Pressable>
              </View>
            </View>
            <Text style={s.accountantDate}>
              Invited {new Date(a.invitedAt).toLocaleDateString('fi-FI')}
              {a.activatedAt ? ` · Activated ${new Date(a.activatedAt).toLocaleDateString('fi-FI')}` : ''}
            </Text>
          </View>
        ))
      )}

      {/* Report Access */}
      <Text style={[s.sectionLabel, { marginTop: 8 }]}>REPORT ACCESS</Text>
      {[
        { label: 'Tuloslaskelma', desc: 'Income statement adjustments', icon: '📊', href: '/reports/pl' },
        { label: 'Tase',          desc: 'Balance sheet adjustments',     icon: '📒', href: '/reports/balance' },
      ].map(r => (
        <Pressable
          key={r.label}
          style={({ pressed }) => [s.reportLinkCard, pressed && { opacity: 0.65 }]}
          onPress={() => router.push(r.href as any)}
        >
          <Text style={s.reportLinkIcon}>{r.icon}</Text>
          <View style={{ flex: 1 }}>
            <Text style={s.reportLinkLabel}>{r.label}</Text>
            <Text style={s.reportLinkDesc}>{r.desc}</Text>
          </View>
          <Feather name="chevron-right" size={16} color={COLORS.muted} />
        </Pressable>
      ))}

      <Text style={s.footer}>◆ ScandiNordic Pro ◆</Text>
    </ScrollView>
  );
}

const makeStyles = () => StyleSheet.create({
  content: { paddingHorizontal: 20, gap: 12 },

  badge:    { fontSize: 9, color: COLORS.primary, letterSpacing: 4, textTransform: 'uppercase' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  backBtn:  { width: 34, height: 34, borderRadius: 17, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center' },
  title:    { fontSize: 22, fontWeight: '700', color: COLORS.text, letterSpacing: -0.5, flex: 1 },
  lockIcon: { fontSize: 20 },
  divider:  { height: 1, backgroundColor: COLORS.border },

  statsRow: { flexDirection: 'row', gap: 8 },
  statCard: {
    flex: 1, backgroundColor: COLORS.card, borderRadius: 12,
    borderWidth: 1, borderColor: COLORS.border, padding: 12, alignItems: 'center',
  },
  statValue: { fontSize: 20, fontWeight: '700' },
  statLabel: { fontSize: 9, color: COLORS.muted, letterSpacing: 1.5, marginTop: 2 },

  inviteBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderWidth: 1, borderColor: COLORS.primary + '60', borderStyle: 'dashed',
    borderRadius: 12, paddingVertical: 14, backgroundColor: COLORS.surface,
  },
  inviteBtnText: { fontSize: 13, fontWeight: '600', color: COLORS.primary },

  formCard: {
    backgroundColor: COLORS.card, borderRadius: 16,
    borderWidth: 1, borderColor: COLORS.primary + '30', padding: 16,
  },
  formTitle: { fontSize: 9, color: COLORS.primary, letterSpacing: 2, fontWeight: '700', marginBottom: 12 },
  fieldLabel: { fontSize: 9, color: COLORS.muted, letterSpacing: 1.2, fontWeight: '600', marginBottom: 6 },
  input: {
    backgroundColor: COLORS.input, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9,
    fontSize: 13, color: COLORS.text,
  },
  permOption: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    borderWidth: 1, borderColor: COLORS.border, borderRadius: 10,
    padding: 12, marginBottom: 6, backgroundColor: COLORS.surface,
  },
  permOptionActive: { borderColor: COLORS.primary + '60', backgroundColor: COLORS.primary + '10' },
  radio: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: COLORS.border, marginTop: 1 },
  radioActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primary },
  permLabel: { fontSize: 12, fontWeight: '600', color: COLORS.text },
  permDesc:  { fontSize: 10, color: COLORS.muted, marginTop: 2 },
  errorText: { fontSize: 11, color: COLORS.danger, marginTop: 6 },
  formActions: { flexDirection: 'row', gap: 8, marginTop: 14 },
  cancelBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 10,
    borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface, alignItems: 'center',
  },
  cancelBtnText: { fontSize: 13, color: COLORS.muted, fontWeight: '600' },
  sendBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 10,
    backgroundColor: COLORS.primary, alignItems: 'center',
  },
  sendBtnText: { fontSize: 13, color: COLORS.background, fontWeight: '700' },

  sectionLabel: { fontSize: 9, color: COLORS.muted, letterSpacing: 2, fontWeight: '600', textTransform: 'uppercase' },

  emptyCard: {
    backgroundColor: COLORS.card, borderRadius: 14,
    borderWidth: 1, borderColor: COLORS.border, padding: 28, alignItems: 'center',
  },
  emptyIcon: { fontSize: 28, marginBottom: 8 },
  emptyText: { fontSize: 13, color: COLORS.muted, fontWeight: '500' },
  emptyHint: { fontSize: 10, color: COLORS.muted + '80', marginTop: 4, textAlign: 'center' },

  accountantCard: {
    backgroundColor: COLORS.card, borderRadius: 14,
    borderWidth: 1, borderColor: COLORS.border, padding: 14,
  },
  accountantTop: { flexDirection: 'row', gap: 10 },
  accountantNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  accountantName: { fontSize: 13, fontWeight: '600', color: COLORS.text },
  accountantEmail: { fontSize: 11, color: COLORS.muted, marginTop: 2 },
  badge2: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 99, borderWidth: 1 },
  badge2Text: { fontSize: 8, fontWeight: '700', letterSpacing: 0.5 },
  accountantActions: { gap: 5, alignItems: 'flex-end' },
  actionBtn: {
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8,
    borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface,
  },
  actionBtnGreen: { borderColor: COLORS.success + '40', backgroundColor: COLORS.success + '15' },
  actionBtnRed:   { borderColor: COLORS.danger  + '40', backgroundColor: COLORS.danger  + '15' },
  actionBtnText:  { fontSize: 10, fontWeight: '600' },
  accountantDate: { fontSize: 9, color: COLORS.muted + '80', marginTop: 8 },

  reportLinkCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: COLORS.card, borderRadius: 14,
    borderWidth: 1, borderColor: COLORS.border, padding: 14,
  },
  reportLinkIcon:  { fontSize: 22 },
  reportLinkLabel: { fontSize: 13, fontWeight: '600', color: COLORS.text },
  reportLinkDesc:  { fontSize: 10, color: COLORS.muted, marginTop: 2 },

  footer: { textAlign: 'center', fontSize: 9, color: COLORS.muted + '60', letterSpacing: 4, marginTop: 8 },
});
