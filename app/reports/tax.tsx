import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, Pressable, TextInput, Alert,
} from 'react-native';
import { useAppDialog } from '@/components/AppDialog';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { router, useFocusEffect } from 'expo-router';
import { COLORS } from '@/constants/colors';
import { useLanguage } from '@/contexts/LanguageContext';
import { getTransactions, getSettings, getUserScopedKey } from '@/lib/storage';
import { supabase } from '@/lib/supabase';
import { getCurrentUserId } from '@/lib/session';
import { formatCurrency } from '@/lib/currency';
import type { Currency } from '@/lib/types';
import DatePickerModal from '@/components/DatePickerModal';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

const BRACKETS = [
  { label: '€0 – €19,900',      min: 0,     max: 19900,   rate: 0.1264, pct: '12.64%' },
  { label: '€19,900 – €29,700', min: 19900, max: 29700,   rate: 0.19,   pct: '19%'    },
  { label: '€29,700 – €49,000', min: 29700, max: 49000,   rate: 0.3025, pct: '30.25%' },
  { label: '€49,000 – €85,800', min: 49000, max: 85800,   rate: 0.34,   pct: '34%'    },
  { label: '> €85,800',         min: 85800, max: Infinity, rate: 0.44,   pct: '44%'    },
];

const TAX_CATS = new Set(['tax','tax_payment','advance_tax','prepayment','income_tax']);

interface TaxPayment { id: string; date: string; amount: number; note: string; periodKey: string; }

function generateId() { return Date.now().toString(36) + Math.random().toString(36).slice(2); }

async function loadPayments(): Promise<TaxPayment[]> {
  const userId = getCurrentUserId();
  if (!userId) return [];
  const { data, error } = await supabase
    .from('tax_payments')
    .select('data')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) { console.error('[tax_payments] fetch failed:', error); return []; }
  return (data ?? []).map(row => row.data as TaxPayment);
}
async function storePayments(p: TaxPayment[]) {
  const userId = getCurrentUserId();
  if (!userId) return;
  await supabase.from('tax_payments').delete().eq('user_id', userId);
  if (p.length === 0) return;
  const rows = p.map(payment => ({ id: payment.id, user_id: userId, data: payment }));
  const { error } = await supabase.from('tax_payments').insert(rows);
  if (error) console.error('[tax_payments] insert failed:', error);
}

export default function TaxPrepaymentScreen() {
  const styles = makeStyles();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const { show: showDialog, dialog } = useAppDialog();
  const now = new Date();

  const defaultStart = `${now.getFullYear()}-01-01`;
  const defaultEnd = now.toISOString().split('T')[0];
  const [transactions, setTransactions] = useState<any[]>([]);
  const [currency, setCurrency] = useState<Currency>('EUR');
  // committed dates drive the calculation
  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(defaultEnd);
  // pending dates — only committed when user taps Apply
  const [pendingStart, setPendingStart] = useState(defaultStart);
  const [pendingEnd, setPendingEnd] = useState(defaultEnd);
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const periodDirty = pendingStart !== startDate || pendingEnd !== endDate;
  const [saved, setSaved] = useState(false);
  const [allPayments, setAllPayments] = useState<TaxPayment[]>([]);
  const [showPayForm, setShowPayForm] = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const [payDate, setPayDate] = useState(now.toISOString().split('T')[0]);
  const [showPayDatePicker, setShowPayDatePicker] = useState(false);
  const [payNote, setPayNote] = useState('');

  const load = useCallback(async () => {
    const [tx, s, payments, savedDates] = await Promise.all([
      getTransactions(), getSettings(), loadPayments(),
      getUserScopedKey('tax_period_dates').then(k => AsyncStorage.getItem(k)),
    ]);
    setTransactions(tx);
    setCurrency(s.currency);
    setAllPayments(payments);
    if (savedDates) {
      try {
        const { start, end } = JSON.parse(savedDates);
        if (start) { setStartDate(start); setPendingStart(start); }
        if (end)   { setEndDate(end);   setPendingEnd(end);   }
      } catch {}
    }
  }, []);

  const handleSaveData = useCallback(async () => {
    try {
      setStartDate(pendingStart);
      setEndDate(pendingEnd);
      await AsyncStorage.setItem(await getUserScopedKey('tax_period_dates'), JSON.stringify({ start: pendingStart, end: pendingEnd }));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      Alert.alert('Error', 'Could not save data.');
    }
  }, [pendingStart, pendingEnd]);

  useEffect(() => { load(); }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const periodKey = `${startDate}_${endDate}`;
  const periodPayments = allPayments.filter(p => p.periodKey === periodKey);
  const manualPaid = periodPayments.reduce((s, p) => s + p.amount, 0);

  const { estimatedTax, bracketAmounts, txPaid, taxableProfit, expensesByVero, totalDeductions } = useMemo(() => {
    const s = new Date(startDate);
    const e = new Date(endDate);
    const period = transactions.filter(tx => {
      const d = new Date(tx.date);
      return d >= s && d <= e;
    });

    const totalIncome = period.filter(t => t.type === 'income').reduce((sum: number, t: any) => sum + t.amount, 0);
    const deductible  = period.filter(t => t.type === 'expense' && !TAX_CATS.has(t.category));
    const totalExpense = deductible.reduce((sum: number, t: any) => sum + t.amount, 0);
    const taxableProfit = Math.max(0, totalIncome - totalExpense);

    const bracketAmounts = BRACKETS.map(b => {
      const taxable = Math.max(0, Math.min(taxableProfit, b.max) - b.min);
      return Math.round(taxable * b.rate * 100) / 100;
    });
    const estimatedTax = bracketAmounts.reduce((s, t) => s + t, 0);
    const txPaid = period.filter(t => t.type === 'expense' && TAX_CATS.has(t.category)).reduce((sum: number, t: any) => sum + t.amount, 0);

    const expensesByVero: Record<string, number> = {};
    deductible.forEach((t: any) => {
      const key = t.veroCategory ?? 'Unclassified';
      expensesByVero[key] = (expensesByVero[key] ?? 0) + t.amount;
    });

    return { estimatedTax, bracketAmounts, txPaid, taxableProfit, expensesByVero, totalDeductions: totalExpense };
  }, [transactions, startDate, endDate]);

  const actualPaid = txPaid + manualPaid;
  const remaining  = Math.max(0, estimatedTax - actualPaid);
  const paidPct    = estimatedTax > 0 ? Math.min(100, (actualPaid / estimatedTax) * 100) : 0;

  const addPayment = async () => {
    const amount = parseFloat(payAmount.replace(',', '.'));
    if (amount <= 0 || isNaN(amount)) { showDialog(t('invalidAmount')); return; }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const record: TaxPayment = { id: generateId(), periodKey, date: payDate, amount, note: payNote };
    const updated = [...allPayments, record];
    setAllPayments(updated);
    await storePayments(updated);
    setShowPayForm(false);
    setPayAmount(''); setPayNote(''); setPayDate(now.toISOString().split('T')[0]);
  };

  const deletePayment = async (id: string) => {
    const updated = allPayments.filter(p => p.id !== id);
    setAllPayments(updated);
    await storePayments(updated);
  };

  const fmt = (v: number) => formatCurrency(v, currency);

  const handleExportPDF = useCallback(async () => {
    const fmtPdf = (v: number) => formatCurrency(v, currency);
    const bracketRows = BRACKETS.map((b, i) => `<tr>
      <td class="label">${b.label}</td>
      <td class="label">${b.pct}</td>
      <td class="value">${fmtPdf(bracketAmounts[i])}</td>
    </tr>`).join('');
    const deductionRows = Object.entries(expensesByVero)
      .sort((a, b) => b[1] - a[1])
      .map(([cat, amount]) => `<tr>
        <td class="label">${cat}</td>
        <td class="value">${fmtPdf(amount)}</td>
      </tr>`).join('');
    const payRows = periodPayments.map(p => `<tr>
      <td class="label">${p.date}</td>
      <td class="label">${p.note || '—'}</td>
      <td class="value">${fmtPdf(p.amount)}</td>
    </tr>`).join('');
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/>
      <style>body{font-family:Helvetica,sans-serif;padding:32px;color:#111;}
      h1{font-size:22px;margin-bottom:4px;}
      .sub{color:#888;font-size:13px;margin-bottom:24px;}
      h2{font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#888;margin:24px 0 8px;}
      table{width:100%;border-collapse:collapse;}
      td{padding:9px 12px;border-bottom:1px solid #e8e8e8;font-size:13px;}
      .label{color:#444;} .value{text-align:right;font-weight:600;}
      .total{font-weight:700;background:#fafafa;}
      .footer{margin-top:32px;font-size:11px;color:#aaa;text-align:center;}
      </style></head><body>
      <h1>${t('taxPrepayment')}</h1>
      <div class="sub">${startDate} – ${endDate}</div>
      <h2>${t('taxableProfit')}</h2>
      <table><tr><td class="label">${t('taxableProfit')}</td><td class="value">${fmtPdf(taxableProfit)}</td></tr></table>
      <h2>${t('progressiveTaxBrackets')}</h2>
      <table>
        <tr><td class="label total">${t('rate')}</td><td class="label total">%</td><td class="value total">${t('amount')}</td></tr>
        ${bracketRows}
        <tr><td class="total" colspan="2">${t('totalEstimatedTax')}</td><td class="value total">${fmtPdf(estimatedTax)}</td></tr>
      </table>
      <h2>Expense Deductions by Category</h2>
      <table>
        ${deductionRows || `<tr><td colspan="2" class="label">No deductible expenses</td></tr>`}
        <tr><td class="total">Total Deductions</td><td class="value total">${fmtPdf(totalDeductions)}</td></tr>
      </table>
      <h2>${t('paymentHistory')}</h2>
      <table>
        ${payRows || `<tr><td colspan="3" class="label">${t('noPayments')}</td></tr>`}
        <tr><td class="total" colspan="2">${t('totalPaid')}</td><td class="value total">${fmtPdf(actualPaid)}</td></tr>
        <tr><td class="total" colspan="2">${t('remaining')}</td><td class="value total">${fmtPdf(remaining)}</td></tr>
      </table>
      <div class="footer">◆ ScandiNordic Pro v.2</div>
      </body></html>`;
    try {
      const { uri } = await Print.printToFileAsync({ html });
      await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: '.pdf' });
    } catch {}
  }, [bracketAmounts, periodPayments, estimatedTax, actualPaid, remaining, taxableProfit, expensesByVero, totalDeductions, currency, startDate, endDate, t]);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: COLORS.background }}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 32 }]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <Pressable style={styles.back} onPress={() => router.back()} hitSlop={10}>
        <Feather name="arrow-left" size={28} color={COLORS.primary} />
        <Text style={styles.backText}>{t('reports')}</Text>
      </Pressable>
      <Text style={styles.badge}>◆ ScandiNordic Pro ◆</Text>
      <View style={styles.titleRow}>
        <Text style={styles.title}>{t('taxPrepayment')} 💰</Text>
      </View>
      <View style={styles.divider} />

      {/* Period selector */}
      <View style={styles.periodCard}>
        <Text style={styles.periodTitle}>{t('period')}</Text>
        <View style={styles.periodRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.fieldLabel}>{t('periodStart')}</Text>
            <Pressable style={styles.periodDateRow} onPress={() => setShowStartPicker(true)}>
              <Text style={[styles.periodDateText, pendingStart !== startDate && { color: COLORS.warning }]}>{pendingStart}</Text>
              <Feather name="calendar" size={14} color={COLORS.muted} />
            </Pressable>
          </View>
          <Text style={styles.periodDash}>–</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.fieldLabel}>{t('periodEnd')}</Text>
            <Pressable style={styles.periodDateRow} onPress={() => setShowEndPicker(true)}>
              <Text style={[styles.periodDateText, pendingEnd !== endDate && { color: COLORS.warning }]}>{pendingEnd}</Text>
              <Feather name="calendar" size={14} color={COLORS.muted} />
            </Pressable>
          </View>
        </View>
        <Text style={styles.periodHint}>{t('changesNotSaved')}</Text>
      </View>
      {showStartPicker && (
        <DatePickerModal
          visible={showStartPicker}
          value={pendingStart}
          onConfirm={d => { setPendingStart(d); setShowStartPicker(false); }}
          onCancel={() => setShowStartPicker(false)}
          title={t('periodStart')}
        />
      )}
      {showEndPicker && (
        <DatePickerModal
          visible={showEndPicker}
          value={pendingEnd}
          onConfirm={d => { setPendingEnd(d); setShowEndPicker(false); }}
          onCancel={() => setShowEndPicker(false)}
          title={t('periodEnd')}
        />
      )}

      {/* Hero card */}
      <View style={styles.heroCard}>
        <Text style={styles.heroSub}>{t('estimatedTaxPrepayments')}</Text>
        <View style={styles.heroRow}>
          <View>
            <Text style={styles.heroEstLabel}>{t('estimated')}</Text>
            <Text style={styles.heroEst}>{fmt(estimatedTax)}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.heroEstLabel}>{t('actualPaid')}</Text>
            <Text style={[styles.heroEst, { color: COLORS.success }]}>{fmt(actualPaid)}</Text>
          </View>
        </View>
        {/* Progress bar */}
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${paidPct}%` as any }]} />
        </View>
        <View style={styles.progressLabels}>
          <Text style={styles.progressLabel}>{paidPct.toFixed(0)}{t('percentPaid')}</Text>
          <Text style={styles.progressLabel}>
            {t('remaining')}: <Text style={{ color: remaining > 0 ? COLORS.warning : COLORS.success, fontWeight: '700' }}>{fmt(remaining)}</Text>
          </Text>
        </View>
      </View>

      {/* Taxable profit */}
      <View style={styles.infoRow}>
        <Text style={styles.infoLabel}>{t('taxableProfit')}</Text>
        <Text style={styles.infoValue}>{fmt(taxableProfit)}</Text>
      </View>

      {/* Tax brackets */}
      <Text style={styles.sectionLabel}>{t('progressiveTaxBrackets')}</Text>
      <View style={styles.table}>
        {BRACKETS.map((b, i) => {
          const amount = bracketAmounts[i];
          const active = amount > 0;
          return (
            <View key={b.label} style={[styles.bracketRow, i > 0 && { borderTopWidth: 1, borderTopColor: COLORS.border }, active && { backgroundColor: COLORS.primaryDim }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.bracketLabel, !active && { color: COLORS.muted + '60' }]}>{b.label}</Text>
                <Text style={[styles.bracketPct, !active && { color: COLORS.muted + '40' }]}>{b.pct}</Text>
              </View>
              <Text style={[styles.bracketAmount, !active && { color: COLORS.muted + '40' }]}>{fmt(amount)}</Text>
            </View>
          );
        })}
        <View style={[styles.bracketRow, { borderTopWidth: 1, borderTopColor: COLORS.border, backgroundColor: COLORS.surface }]}>
          <Text style={[styles.bracketLabel, { fontWeight: '700', textTransform: 'uppercase', fontSize: 10 }]}>{t('totalEstimatedTax')}</Text>
          <Text style={[styles.bracketAmount, { color: COLORS.primary, fontWeight: '700' }]}>{fmt(estimatedTax)}</Text>
        </View>
      </View>

      {/* Payment history */}
      <View style={styles.payHeader}>
        <Text style={styles.sectionLabel}>{t('paymentHistory')}</Text>
        <Pressable
          style={styles.markPaidBtn}
          onPress={() => { Haptics.selectionAsync(); setShowPayForm(v => !v); }}
        >
          <Text style={styles.markPaidText}>+ {t('markAsPaid')}</Text>
        </Pressable>
      </View>

      {/* Pay form */}
      {showPayForm && (
        <View style={styles.payForm}>
          <Text style={styles.payFormTitle}>{t('recordPayment')}</Text>
          <View style={styles.twoCol}>
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>{t('amount')}</Text>
              <TextInput style={styles.input} value={payAmount} onChangeText={setPayAmount} placeholder="0.00" placeholderTextColor={COLORS.muted} keyboardType="decimal-pad" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>{t('date')}</Text>
              <Pressable style={[styles.input, { justifyContent: 'center' }]} onPress={() => setShowPayDatePicker(true)}>
                <Text style={{ color: COLORS.text, fontSize: 13 }}>{payDate}</Text>
              </Pressable>
              {showPayDatePicker && (
                <DatePickerModal
                  visible={showPayDatePicker}
                  value={payDate}
                  onConfirm={d => { setPayDate(d); setShowPayDatePicker(false); }}
                  onCancel={() => setShowPayDatePicker(false)}
                  title={t('date')}
                />
              )}
            </View>
          </View>
          <Text style={styles.fieldLabel}>{t('noteReference')}</Text>
          <TextInput style={styles.input} value={payNote} onChangeText={setPayNote} placeholder={t('noteReferencePlaceholder')} placeholderTextColor={COLORS.muted} />
          <View style={styles.payFormBtns}>
            <Pressable style={styles.cancelBtn} onPress={() => setShowPayForm(false)}>
              <Text style={styles.cancelBtnText}>{t('cancel')}</Text>
            </Pressable>
            <Pressable style={styles.saveBtn} onPress={addPayment}>
              <Text style={styles.saveBtnText}>{t('savePayment')}</Text>
            </Pressable>
          </View>
        </View>
      )}

      {periodPayments.length === 0 ? (
        <View style={styles.emptyPayments}>
          <Text style={styles.emptyPayText}>{t('noPayments')}</Text>
        </View>
      ) : (
        <View style={styles.table}>
          {periodPayments
            .sort((a, b) => b.date.localeCompare(a.date))
            .map((p, i) => (
              <View key={p.id} style={[styles.paymentRow, i > 0 && { borderTopWidth: 1, borderTopColor: COLORS.border }]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.paymentDate}>{p.date}</Text>
                  {p.note ? <Text style={styles.paymentNote}>{p.note}</Text> : null}
                </View>
                <Text style={styles.paymentAmount}>{fmt(p.amount)}</Text>
                <Pressable onPress={() => deletePayment(p.id)} style={{ padding: 4 }}>
                  <Feather name="x" size={14} color={COLORS.muted} />
                </Pressable>
              </View>
            ))}
          <View style={[styles.paymentRow, { borderTopWidth: 1, borderTopColor: COLORS.border, backgroundColor: COLORS.surface }]}>
            <Text style={[styles.paymentDate, { fontWeight: '700', textTransform: 'uppercase', fontSize: 10 }]}>{t('totalPaid')}</Text>
            <Text style={[styles.paymentAmount, { color: COLORS.success }]}>{fmt(manualPaid)}</Text>
          </View>
        </View>
      )}

      {/* Save Data / Export PDF */}
      <View style={styles.actionRow}>
        <Pressable
          style={({ pressed }) => [styles.saveDataBtn, pressed && { opacity: 0.65 }]}
          onPress={handleSaveData}
        >
          <Feather name={saved ? 'check-circle' : 'save'} size={16} color={saved ? COLORS.success : COLORS.text} />
          <Text style={[styles.saveDataBtnText, saved && { color: COLORS.success }]}>{t('saveData')}</Text>
        </Pressable>
        <Pressable style={styles.exportPdfBtn} onPress={handleExportPDF}>
          <Feather name="file-text" size={16} color={COLORS.background} />
          <Text style={styles.exportPdfBtnText}>{t('exportPdf')}</Text>
        </Pressable>
      </View>

      <Text style={styles.version}>◆ ScandiNordic Pro v.2</Text>
      {dialog}
    </ScrollView>
  );
}

const makeStyles = () => StyleSheet.create({
  content: { paddingHorizontal: 20, gap: 14 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  backText: { fontSize: 14, color: COLORS.primary, fontWeight: '500' },
  badge: { fontSize: 9, color: COLORS.primary, letterSpacing: 4, textTransform: 'uppercase' },
  titleRow: { marginTop: 4 },
  title: { fontSize: 24, fontWeight: '700', color: COLORS.text, letterSpacing: -0.5 },
  divider: { height: 1, backgroundColor: COLORS.border },
  periodCard: { backgroundColor: COLORS.card, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, padding: 14, gap: 10 },
  periodTitle: { fontSize: 10, color: COLORS.muted, textTransform: 'uppercase', letterSpacing: 1.5, fontWeight: '600' },
  periodRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  periodDash: { fontSize: 14, color: COLORS.muted, paddingBottom: 10 },
  fieldLabel: { fontSize: 9, color: COLORS.muted, textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: '600', marginBottom: 4 },
  periodDateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: COLORS.input, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: 10, paddingVertical: 9 },
  periodDateText: { color: COLORS.primary, fontSize: 13, fontWeight: '700' },
  periodHint: { fontSize: 11, color: COLORS.muted, lineHeight: 15 },
  actionRow: { flexDirection: 'row' as const, gap: 10 },
  saveDataBtn: {
    flex: 1, flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 8,
    borderRadius: 14, borderWidth: 1, borderColor: COLORS.border,
    backgroundColor: COLORS.surface, paddingVertical: 15,
  },
  saveDataBtnText: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  exportPdfBtn: {
    flex: 1, flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 8,
    borderRadius: 14, backgroundColor: COLORS.primary, paddingVertical: 15,
  },
  exportPdfBtnText: { fontSize: 14, fontWeight: '700', color: COLORS.background },
  heroCard: { backgroundColor: COLORS.card, borderRadius: 16, borderWidth: 1, borderColor: COLORS.primary + '30', padding: 16, gap: 12 },
  heroSub: { fontSize: 9, color: COLORS.muted, textTransform: 'uppercase', letterSpacing: 1.5, fontWeight: '600' },
  heroRow: { flexDirection: 'row', justifyContent: 'space-between' },
  heroEstLabel: { fontSize: 10, color: COLORS.muted, marginBottom: 2 },
  heroEst: { fontSize: 22, fontWeight: '700', color: COLORS.text, letterSpacing: -0.5 },
  progressTrack: { height: 6, backgroundColor: COLORS.border, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: COLORS.success, borderRadius: 3 },
  progressLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  progressLabel: { fontSize: 10, color: COLORS.muted },
  infoRow: { backgroundColor: COLORS.card, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12 },
  infoLabel: { fontSize: 13, color: COLORS.muted },
  infoValue: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  sectionLabel: { fontSize: 10, color: COLORS.muted, textTransform: 'uppercase', letterSpacing: 1.5, fontWeight: '600' },
  table: { backgroundColor: COLORS.card, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden' },
  bracketRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10 },
  bracketLabel: { fontSize: 12, fontWeight: '500', color: COLORS.text },
  bracketPct: { fontSize: 10, color: COLORS.primary, marginTop: 1 },
  bracketAmount: { fontSize: 13, fontWeight: '700', color: COLORS.text },
  payHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  markPaidBtn: { backgroundColor: COLORS.primaryDim, borderRadius: 99, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: COLORS.primary + '30' },
  markPaidText: { fontSize: 10, fontWeight: '700', color: COLORS.primary },
  payForm: { backgroundColor: COLORS.card, borderRadius: 14, borderWidth: 1, borderColor: COLORS.primary + '30', padding: 14, gap: 10 },
  payFormTitle: { fontSize: 10, color: COLORS.primary, textTransform: 'uppercase', letterSpacing: 1, fontWeight: '700' },
  twoCol: { flexDirection: 'row', gap: 10 },
  input: { backgroundColor: COLORS.input, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, color: COLORS.text, fontSize: 14, paddingHorizontal: 12, paddingVertical: 10 },
  payFormBtns: { flexDirection: 'row', gap: 8 },
  cancelBtn: { flex: 1, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, paddingVertical: 12, alignItems: 'center' },
  cancelBtnText: { fontSize: 13, color: COLORS.muted },
  saveBtn: { flex: 1, borderRadius: 10, backgroundColor: COLORS.primary, paddingVertical: 12, alignItems: 'center' },
  saveBtnText: { fontSize: 13, fontWeight: '700', color: COLORS.background },
  emptyPayments: { backgroundColor: COLORS.card, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, padding: 20, alignItems: 'center' },
  emptyPayText: { fontSize: 12, color: COLORS.muted },
  paymentRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10 },
  paymentDate: { fontSize: 13, fontWeight: '600', color: COLORS.text },
  paymentNote: { fontSize: 10, color: COLORS.muted, marginTop: 1 },
  paymentAmount: { fontSize: 13, fontWeight: '700', color: COLORS.success },
  version: { textAlign: 'center', fontSize: 9, color: COLORS.muted + '60', letterSpacing: 4 },
});
