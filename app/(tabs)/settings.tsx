import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  Switch,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { COLORS } from '@/constants/colors';
import { getSettings, saveSettings } from '@/lib/storage';
import { supabase } from '@/lib/supabase';
import type { Language, Currency, Settings } from '@/lib/types';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useAppDialog } from '@/components/AppDialog';

// Dynamic imports — same pattern as other screens. Allow graceful degradation
// on environments where these native modules aren't available.
let FileSystem: any = null;
let Sharing: any = null;
try { FileSystem = require('expo-file-system/legacy'); } catch {}
try { Sharing = require('expo-sharing'); } catch {}

const LANGUAGES: { code: Language; label: string; flag: string }[] = [
  { code: 'en', label: 'English', flag: '🇬🇧' },
  { code: 'fi', label: 'Suomi', flag: '🇫🇮' },
  { code: 'sv', label: 'Svenska', flag: '🇸🇪' },
  { code: 'da', label: 'Dansk', flag: '🇩🇰' },
];

const CURRENCIES: { code: Currency; label: string }[] = [
  { code: 'EUR', label: 'Euro (€)' },
  { code: 'SEK', label: 'Swedish Krona (kr)' },
  { code: 'DKK', label: 'Danish Krone (kr.)' },
  { code: 'NOK', label: 'Norwegian Krone (kr)' },
];

const VAT_PRESETS = [25.5, 14, 13.5, 10, 0];

export default function SettingsScreen() {
  const styles = makeSettings();
  const insets = useSafeAreaInsets();
  const { t, language, setLanguage } = useLanguage();
  const { user, signOut } = useAuth();
  const { mode, setMode } = useTheme();
  const { show: showDialog, dialog } = useAppDialog();

  const [settings, setSettings] = useState<Settings | null>(null);
  const [draft, setDraft] = useState<Settings | null>(null);
  const [companyOpen, setCompanyOpen] = useState(false);
  const [appearanceOpen, setAppearanceOpen] = useState(true);
  const [signingOut, setSigningOut] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const [curOpen, setCurOpen] = useState(false);

  const load = useCallback(async () => {
    const s = await getSettings();
    setSettings(s);
    setDraft(s);
  }, []);

  useEffect(() => { load(); }, [load]);

  const patchDraft = (patch: Partial<Settings>) => {
    setDraft(d => ({ ...(d ?? {} as Settings), ...patch }));
  };

  const handleSave = async () => {
    if (!draft) return;
    await saveSettings(draft);
    if (draft.language !== language) setLanguage(draft.language);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await load();
  };

  const handleSignOut = async () => {
    const idx = await showDialog(
      t('signOut'),
      'Are you sure you want to sign out?',
      [
        { text: t('cancel'), style: 'cancel' },
        { text: t('signOut'), style: 'destructive' },
      ],
    );
    if (idx === 1) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      setSigningOut(true);
      try {
        await signOut();
      } finally {
        setSigningOut(false);
      }
    }
  };

  // GDPR Article 20 — Right to Data Portability.
  const handleExportData = async () => {
    setExporting(true);
    try {
      const { data, error } = await supabase.functions.invoke('export-data');
      if (error) throw error;
      if (!data) throw new Error('Empty response from export-data');

      const json = JSON.stringify(data, null, 2);
      const filename = `scandinordic-export-${new Date().toISOString().split('T')[0]}.json`;

      if (FileSystem && Sharing) {
        const uri = `${FileSystem.cacheDirectory}${filename}`;
        await FileSystem.writeAsStringAsync(uri, json);
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(uri, { mimeType: 'application/json', dialogTitle: t('exportMyData') });
        } else {
          await showDialog(t('exportMyData'), `Saved: ${filename}`, [{ text: 'OK' }]);
        }
      } else {
        await showDialog(t('exportError'), 'File sharing unavailable on this device.', [{ text: 'OK' }]);
      }
    } catch (e: any) {
      await showDialog(t('exportError'), e?.message ?? 'Unknown error', [{ text: 'OK' }]);
    } finally {
      setExporting(false);
    }
  };

  // GDPR Article 17 — Right to Erasure. Two-step confirmation to prevent fat-fingering.
  const handleDeleteAccount = async () => {
    const idx1 = await showDialog(
      t('deleteAccount'),
      t('deleteAccountConfirm1'),
      [
        { text: t('cancel'), style: 'cancel' },
        { text: t('deleteAccountContinue'), style: 'destructive' },
      ],
    );
    if (idx1 !== 1) return;

    const idx2 = await showDialog(
      t('deleteAccount'),
      t('deleteAccountConfirm2'),
      [
        { text: t('cancel'), style: 'cancel' },
        { text: t('deleteAccountConfirmFinal'), style: 'destructive' },
      ],
    );
    if (idx2 !== 1) return;

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    setDeletingAccount(true);
    try {
      const { error } = await supabase.functions.invoke('delete-account');
      if (error) throw error;
      // JWT is now invalid; clear local session and redirect to login.
      await signOut();
    } catch (e: any) {
      setDeletingAccount(false);
      await showDialog(t('deleteAccountError'), e?.message ?? 'Unknown error', [{ text: 'OK' }]);
    }
  };

  if (!settings || !draft) return null;

  return (
    <>
    <ScrollView
      style={{ flex: 1, backgroundColor: COLORS.background }}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 100 }]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {/* Header */}
      <Text style={styles.badge}>◆ ScandiNordic Pro ◆</Text>
      <Text style={styles.title}>{t('settings')}</Text>
      <View style={styles.divider} />

      {/* Company Info */}
      <View style={styles.card}>
        <Pressable
          style={({ pressed }) => [styles.cardHeader, pressed && { backgroundColor: COLORS.surface }]}
          onPress={() => { Haptics.selectionAsync(); setCompanyOpen(o => !o); }}
        >
          <View>
            <Text style={styles.sectionLabel}>{t('companyInfo')}</Text>
            {!companyOpen && draft.companyName ? (
              <Text style={styles.sectionSub}>{draft.companyName}</Text>
            ) : null}
          </View>
          <Feather name={companyOpen ? 'chevron-up' : 'chevron-down'} size={16} color={COLORS.muted} />
        </Pressable>

        {companyOpen && (
          <>
            <InputField label={t('businessName')} value={draft.companyName ?? ''} onChangeText={v => patchDraft({ companyName: v })} />
            <View style={styles.twoCol}>
              <View style={{ flex: 1 }}>
                <InputField label={t('companyId')} value={draft.companyId ?? ''} onChangeText={v => patchDraft({ companyId: v })} />
              </View>
              <View style={{ flex: 1 }}>
                <InputField label={t('vatNo')} value={draft.vatNumber ?? ''} onChangeText={v => patchDraft({ vatNumber: v })} />
              </View>
            </View>
            <InputField label={t('streetAddress')} value={draft.address ?? ''} onChangeText={v => patchDraft({ address: v })} />
            <View style={styles.twoCol}>
              <View style={{ flex: 1 }}>
                <InputField label={t('cityLabel')} value={draft.city ?? ''} onChangeText={v => patchDraft({ city: v })} />
              </View>
              <View style={{ flex: 1 }}>
                <InputField label={t('postalCode')} value={draft.postalCode ?? ''} onChangeText={v => patchDraft({ postalCode: v })} />
              </View>
            </View>
            <InputField label={t('countryLabel')} value={draft.country ?? ''} onChangeText={v => patchDraft({ country: v })} />
            <View style={styles.twoCol}>
              <View style={{ flex: 1 }}>
                <InputField label={t('email')} value={draft.email ?? ''} onChangeText={v => patchDraft({ email: v })} keyboardType="email-address" autoCapitalize="none" />
              </View>
              <View style={{ flex: 1 }}>
                <InputField label={t('phoneLabel')} value={draft.phone ?? ''} onChangeText={v => patchDraft({ phone: v })} keyboardType="phone-pad" />
              </View>
            </View>
            <InputField label={t('ibanLabel')} value={draft.iban ?? ''} onChangeText={v => patchDraft({ iban: v })} autoCapitalize="characters" />
            <InputField label={t('bicLabel')} value={draft.bic ?? ''} onChangeText={v => patchDraft({ bic: v })} autoCapitalize="characters" last />
          </>
        )}
      </View>

      {/* Appearance */}
      <View style={styles.card}>
        <Pressable
          style={({ pressed }) => [styles.cardHeader, pressed && { backgroundColor: COLORS.surface }]}
          onPress={() => { Haptics.selectionAsync(); setAppearanceOpen(o => !o); setLangOpen(false); setCurOpen(false); }}
        >
          <View>
            <Text style={styles.sectionLabel}>{t('appearance')}</Text>
            {!appearanceOpen && (
              <View style={styles.pillRow}>
                <View style={styles.pill}><Text style={styles.pillText}>🌙 Dark</Text></View>
                <View style={styles.pill}><Text style={styles.pillText}>{LANGUAGES.find(l => l.code === (draft.language ?? language))?.label}</Text></View>
                <View style={styles.pill}><Text style={styles.pillText}>{draft.currency}</Text></View>
                {draft.defaultVatPercent ? (
                  <View style={styles.pill}><Text style={styles.pillText}>VAT {draft.defaultVatPercent}%</Text></View>
                ) : null}
              </View>
            )}
          </View>
          <Feather name={appearanceOpen ? 'chevron-up' : 'chevron-down'} size={16} color={COLORS.muted} />
        </Pressable>

        {appearanceOpen && (
          <>
            {/* Dark Mode */}
            <View style={styles.row}>
              <Text style={styles.rowLabel}>{t('darkMode')}</Text>
              <Switch
                value={mode === 'dark'}
                onValueChange={v => {
                  const newMode = v ? 'dark' : 'light';
                  setMode(newMode);
                  patchDraft({ darkMode: v });
                }}
                trackColor={{ false: COLORS.border, true: COLORS.primary }}
                thumbColor={COLORS.background}
              />
            </View>

            {/* Language */}
            <Pressable
              style={({ pressed }) => [styles.row, pressed && { backgroundColor: COLORS.surface }]}
              onPress={() => { Haptics.selectionAsync(); setLangOpen(o => !o); setCurOpen(false); }}
            >
              <Text style={styles.rowLabel}>{t('language')}</Text>
              <View style={styles.rowRight}>
                <Text style={styles.rowValue}>
                  {LANGUAGES.find(l => l.code === (draft.language ?? language))?.flag} {LANGUAGES.find(l => l.code === (draft.language ?? language))?.label}
                </Text>
                <Feather name={langOpen ? 'chevron-up' : 'chevron-down'} size={16} color={COLORS.muted} />
              </View>
            </Pressable>
            {langOpen && LANGUAGES.map(lang => (
              <Pressable
                key={lang.code}
                style={({ pressed }) => [styles.subRow, pressed && { backgroundColor: COLORS.background }]}
                onPress={() => { Haptics.selectionAsync(); patchDraft({ language: lang.code }); setLangOpen(false); }}
              >
                <View style={styles.rowLeft}>
                  <Text style={styles.flag}>{lang.flag}</Text>
                  <Text style={styles.rowLabel}>{lang.label}</Text>
                </View>
                {(draft.language ?? language) === lang.code && <Feather name="check" size={16} color={COLORS.primary} />}
              </Pressable>
            ))}

            {/* Currency */}
            <Pressable
              style={({ pressed }) => [styles.row, pressed && { backgroundColor: COLORS.surface }]}
              onPress={() => { Haptics.selectionAsync(); setCurOpen(o => !o); setLangOpen(false); }}
            >
              <Text style={styles.rowLabel}>{t('currency')}</Text>
              <View style={styles.rowRight}>
                <Text style={styles.rowValue}>{CURRENCIES.find(c => c.code === draft.currency)?.label ?? draft.currency}</Text>
                <Feather name={curOpen ? 'chevron-up' : 'chevron-down'} size={16} color={COLORS.muted} />
              </View>
            </Pressable>
            {curOpen && CURRENCIES.map(cur => (
              <Pressable
                key={cur.code}
                style={({ pressed }) => [styles.subRow, pressed && { backgroundColor: COLORS.background }]}
                onPress={() => { Haptics.selectionAsync(); patchDraft({ currency: cur.code }); setCurOpen(false); }}
              >
                <Text style={styles.rowLabel}>{cur.label}</Text>
                {draft.currency === cur.code && <Feather name="check" size={16} color={COLORS.primary} />}
              </Pressable>
            ))}

            {/* Default VAT */}
            <View style={[styles.inputBlock, { borderBottomWidth: 0, paddingBottom: 14 }]}>
              <Text style={styles.inputLabel}>{t('defaultVat')}</Text>
              <View style={styles.vatPresets}>
                {VAT_PRESETS.map(v => (
                  <Pressable
                    key={v}
                    style={[styles.vatChip, draft.defaultVatPercent === v && styles.vatChipActive]}
                    onPress={() => { Haptics.selectionAsync(); patchDraft({ defaultVatPercent: v }); }}
                  >
                    <Text style={[styles.vatChipText, draft.defaultVatPercent === v && styles.vatChipTextActive]}>
                      {v}%
                    </Text>
                  </Pressable>
                ))}
              </View>
              <TextInput
                style={styles.input}
                value={String(draft.defaultVatPercent ?? '')}
                onChangeText={v => patchDraft({ defaultVatPercent: parseFloat(v) || 0 })}
                keyboardType="decimal-pad"
                placeholder="0"
                placeholderTextColor={COLORS.muted}
              />
            </View>
          </>
        )}
      </View>

      {/* Integrations */}
      <View style={styles.card}>
        <Pressable
          style={({ pressed }) => [styles.cardHeader, { borderBottomWidth: 0 }, pressed && { backgroundColor: COLORS.surface }]}
          onPress={() => { Haptics.selectionAsync(); router.push('/integrations'); }}
        >
          <View style={styles.rowLeft}>
            <View style={styles.rowIconBox}>
              <Feather name="zap" size={14} color={COLORS.primary} />
            </View>
            <Text style={[styles.rowLabel, { fontSize: 14 }]}>Integrations</Text>
          </View>
          <Feather name="chevron-right" size={16} color={COLORS.muted} />
        </Pressable>
      </View>

      {/* Plan */}
      <View style={styles.card}>
        <View style={[styles.cardHeader, { borderBottomWidth: 0 }]}>
          <View>
            <Text style={styles.sectionLabel}>{t('plan')}</Text>
            <Text style={styles.planName}>PRO</Text>
          </View>
          <Pressable style={styles.managePlanBtn} onPress={() => router.push('/billing')}>
            <Text style={styles.managePlanText}>{t('managePlan')}</Text>
          </Pressable>
        </View>
      </View>

      {/* Legal */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.sectionLabel}>{t('legal')}</Text>
        </View>
        {([
          { key: 'privacyPolicy', href: '/legal/privacy' },
          { key: 'termsOfService', href: '/legal/terms' },
          { key: 'dpa', href: '/legal/dpa' },
          { key: 'cookiePolicy', href: '/legal/cookies' },
        ]).map(({ key, href }, i, arr) => (
          <Pressable
            key={key}
            style={({ pressed }) => [
              styles.row,
              { borderBottomColor: i < arr.length - 1 ? COLORS.border : 'transparent' },
              pressed && { backgroundColor: COLORS.surface },
            ]}
            onPress={() => router.push(href as any)}
          >
            <Text style={styles.rowLabel}>{t(key)}</Text>
            <Text style={styles.legalArrow}>→</Text>
          </Pressable>
        ))}
      </View>

      {/* Account */}
      {user?.email ? (
        <View style={styles.card}>
          <View style={[styles.cardHeader, { borderBottomWidth: 1, borderBottomColor: COLORS.border }]}>
            <View>
              <Text style={styles.sectionLabel}>{t('account')}</Text>
              <Text style={styles.sectionSub}>{user.email}</Text>
            </View>
          </View>

          {/* GDPR Art. 20 — Export My Data */}
          <Pressable
            style={({ pressed }) => [styles.row, pressed && { backgroundColor: COLORS.surface }]}
            onPress={handleExportData}
            disabled={exporting}
          >
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={styles.rowLabel}>{t('exportMyData')}</Text>
              <Text style={[styles.rowValue, { marginTop: 2 }]}>{t('exportDataDesc')}</Text>
            </View>
            {exporting
              ? <ActivityIndicator size="small" color={COLORS.primary} />
              : <Text style={styles.legalArrow}>→</Text>}
          </Pressable>

          {/* GDPR Art. 17 — Delete Account */}
          <Pressable
            style={({ pressed }) => [styles.row, { borderBottomColor: 'transparent' }, pressed && { backgroundColor: COLORS.surface }]}
            onPress={handleDeleteAccount}
            disabled={deletingAccount}
          >
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={[styles.rowLabel, { color: COLORS.danger }]}>{t('deleteAccount')}</Text>
              <Text style={[styles.rowValue, { marginTop: 2 }]}>{t('deleteAccountDesc')}</Text>
            </View>
            {deletingAccount
              ? <ActivityIndicator size="small" color={COLORS.danger} />
              : <Text style={[styles.legalArrow, { color: COLORS.danger }]}>→</Text>}
          </Pressable>
        </View>
      ) : null}

      {/* Actions */}
      <View style={styles.actions}>
        <Pressable
          style={({ pressed }) => [styles.saveBtn, pressed && { opacity: 0.85 }]}
          onPress={handleSave}
        >
          <Text style={styles.saveBtnText}>✓ {t('save')}</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.signOutBtn, pressed && { opacity: 0.85 }]}
          onPress={handleSignOut}
          disabled={signingOut}
        >
          {signingOut
            ? <ActivityIndicator size="small" color={COLORS.danger} />
            : <Text style={styles.signOutBtnText}>{t('signOut')}</Text>}
        </Pressable>
      </View>

      <Text style={styles.footer}>◆ ScandiNordic Pro v.2</Text>
    </ScrollView>
    {dialog}
    </>
  );
}

function InputField({
  label, value, onChangeText, keyboardType, autoCapitalize, last,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  keyboardType?: any;
  autoCapitalize?: any;
  last?: boolean;
}) {
  const styles = makeSettings();
  return (
    <View style={[styles.inputBlock, last && { borderBottomWidth: 0 }]}>
      <Text style={styles.inputLabel}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholderTextColor={COLORS.muted}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
      />
    </View>
  );
}

const makeSettings = () => StyleSheet.create({
  content: { paddingHorizontal: 20, gap: 10 },

  badge: { fontSize: 9, color: COLORS.primary, letterSpacing: 4, textTransform: 'uppercase' },
  title: { fontSize: 24, fontWeight: '700', color: COLORS.text, letterSpacing: -0.5, marginTop: 4 },
  divider: { height: 1, backgroundColor: COLORS.border, marginTop: 12, marginBottom: 4 },

  card: {
    backgroundColor: COLORS.card, borderRadius: 16, borderWidth: 1,
    borderColor: COLORS.border, overflow: 'hidden',
  },

  cardHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },

  sectionLabel: {
    fontSize: 10, color: COLORS.muted, textTransform: 'uppercase',
    letterSpacing: 1.5, fontWeight: '600',
  },
  sectionSub: { fontSize: 13, color: COLORS.text, fontWeight: '500', marginTop: 2 },

  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 6 },
  pill: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 99,
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
  },
  pillText: { fontSize: 10, color: COLORS.muted, fontWeight: '500' },

  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  subRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rowLabel: { fontSize: 14, fontWeight: '500', color: COLORS.text },
  rowValue: { fontSize: 13, color: COLORS.muted },
  legalArrow: { fontSize: 16, color: COLORS.muted },

  rowIconBox: {
    width: 28, height: 28, borderRadius: 8,
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    alignItems: 'center', justifyContent: 'center',
  },
  flag: { fontSize: 20 },

  twoCol: { flexDirection: 'row', gap: 0 },

  inputBlock: {
    paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: COLORS.border, gap: 6,
  },
  inputLabel: {
    fontSize: 10, color: COLORS.muted, textTransform: 'uppercase',
    letterSpacing: 0.8, fontWeight: '600',
  },
  input: {
    backgroundColor: COLORS.input, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9,
    fontSize: 13, color: COLORS.text,
  },

  vatPresets: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  vatChip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 99,
    borderWidth: 1, borderColor: COLORS.border,
  },
  vatChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  vatChipText: { fontSize: 11, fontWeight: '600', color: COLORS.muted },
  vatChipTextActive: { color: COLORS.background },

  planName: { fontSize: 14, fontWeight: '700', color: COLORS.primary, letterSpacing: 1, marginTop: 2 },
  managePlanBtn: {
    borderWidth: 1, borderColor: COLORS.primary + '50', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  managePlanText: { fontSize: 10, fontWeight: '600', color: COLORS.primary, textTransform: 'uppercase', letterSpacing: 0.8 },

  actions: { gap: 8, marginTop: 4 },
  saveBtn: {
    backgroundColor: COLORS.primary, borderRadius: 12, paddingVertical: 15,
    alignItems: 'center',
  },
  saveBtnText: { color: COLORS.background, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.5 },
  signOutBtn: {
    borderRadius: 12, borderWidth: 1, borderColor: COLORS.danger + '50',
    paddingVertical: 15, alignItems: 'center',
  },
  signOutBtnText: { fontSize: 12, fontWeight: '700', color: COLORS.danger, textTransform: 'uppercase', letterSpacing: 1.5 },

  footer: { textAlign: 'center', fontSize: 9, color: COLORS.muted + '60', letterSpacing: 4, marginTop: 8 },
});
