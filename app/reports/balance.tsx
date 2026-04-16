import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { COLORS } from '@/constants/colors';
import { useLanguage } from '@/contexts/LanguageContext';
import { getTransactions, getInvoices, getSettings } from '@/lib/storage';
import { formatCurrency } from '@/lib/currency';
import type { Currency } from '@/lib/types';
import DatePickerModal from '@/components/DatePickerModal';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

const BALANCE_DATE_KEY = 'balance_end_date';
const BALANCE_MANUAL_KEY = 'balance_manual_inputs';

// ─── Row defined at MODULE level so React never remounts TextInput on re-render ──

interface RowStyles {
  tableRow: object;
  totalRow: object;
  rowLabel: object;
  rowValue: object;
  inlineInput: object;
}

interface RowProps {
  label: string;
  value?: number;
  indent?: boolean;
  isTotal?: boolean;
  editable?: boolean;
  val?: string;
  onVal?: (v: string) => void;
  fmt: (v: number) => string;
  s: RowStyles;
}

function Row({ label, value, indent, isTotal, editable, val, onVal, fmt, s }: RowProps) {
  return (
    <View style={[s.tableRow, isTotal && s.totalRow, { borderTopWidth: 1, borderTopColor: COLORS.border }]}>
      <Text
        style={[
          s.rowLabel,
          indent && { paddingLeft: 16, color: COLORS.muted },
          isTotal && { fontWeight: '700', color: COLORS.text, fontSize: 10, textTransform: 'uppercase' as const },
        ]}
      >
        {label}
      </Text>
      {editable ? (
        <TextInput
          style={s.inlineInput}
          value={val}
          onChangeText={onVal}
          placeholder="—"
          placeholderTextColor={COLORS.muted}
          keyboardType="decimal-pad"
        />
      ) : (
        <Text style={[s.rowValue, isTotal && { fontWeight: '700' }]}>
          {fmt(value ?? 0)}
        </Text>
      )}
    </View>
  );
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function BalanceSheetScreen() {
  const styles = makeStyles();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const now = new Date();

  const [transactions, setTransactions] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [currency, setCurrency] = useState<Currency>('EUR');
  const todayStr = now.toISOString().split('T')[0];
  const [endDate, setEndDate] = useState(todayStr);
  const [pendingEndDate, setPendingEndDate] = useState(todayStr);
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);
  const dateDirty = pendingEndDate !== endDate;

  // Manual inputs — kept as strings while typing; parsed on compute only
  const [fixedAssets, setFixedAssets] = useState('');
  const [openingEquity, setOpeningEquity] = useState('');
  const [ownerWithdrawal, setOwnerWithdrawal] = useState('');

  const load = useCallback(async () => {
    const [tx, inv, s, savedDate, savedManual] = await Promise.all([
      getTransactions(), getInvoices(), getSettings(),
      AsyncStorage.getItem(BALANCE_DATE_KEY),
      AsyncStorage.getItem(BALANCE_MANUAL_KEY),
    ]);
    setTransactions(tx);
    setInvoices(inv);
    setCurrency(s.currency);
    if (savedDate) { setEndDate(savedDate); setPendingEndDate(savedDate); }
    if (savedManual) {
      try {
        const m = JSON.parse(savedManual);
        if (m.fixedAssets)     setFixedAssets(m.fixedAssets);
        if (m.openingEquity)   setOpeningEquity(m.openingEquity);
        if (m.ownerWithdrawal) setOwnerWithdrawal(m.ownerWithdrawal);
      } catch {}
    }
  }, []);

  const handleSaveData = useCallback(async () => {
    setEndDate(pendingEndDate);
    await Promise.all([
      AsyncStorage.setItem(BALANCE_DATE_KEY, pendingEndDate),
      AsyncStorage.setItem(BALANCE_MANUAL_KEY, JSON.stringify({ fixedAssets, openingEquity, ownerWithdrawal })),
    ]);
  }, [pendingEndDate, fixedAssets, openingEquity, ownerWithdrawal]);

  const handleExportPDF = useCallback(async () => {
    const fmt2 = (v: number) => formatCurrency(v, currency);
    const parseManual = (v: string) => parseFloat(v.replace(',', '.')) || 0;
    const fa = parseManual(fixedAssets);
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/>
      <style>body{font-family:Helvetica,sans-serif;padding:32px;color:#111;}
      h1{font-size:22px;margin-bottom:4px;}
      .sub{color:#888;font-size:13px;margin-bottom:24px;}
      table{width:100%;border-collapse:collapse;}
      td{padding:9px 12px;border-bottom:1px solid #e8e8e8;font-size:13px;}
      .label{color:#444;} .value{text-align:right;font-weight:600;}
      .section{background:#f7f7f7;font-weight:700;font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#888;padding:10px 12px;}
      .total td{font-weight:700;font-size:13px;background:#fafafa;}
      .footer{margin-top:32px;font-size:11px;color:#aaa;text-align:center;}
      </style></head><body>
      <h1>${t('balanceSheet')}</h1>
      <div class="sub">${t('periodEnd')}: ${endDate}</div>
      <table>
        <tr><td colspan="2" class="section">${t('assets')}</td></tr>
        <tr><td class="label" style="padding-left:24px">${t('fixedAssets')}</td><td class="value">${fmt2(fa)}</td></tr>
        <tr><td class="label" style="padding-left:24px">${t('receivables')}</td><td class="value">${fmt2(computed.receivables)}</td></tr>
        <tr class="total"><td class="label">${t('totalAssets')}</td><td class="value">${fmt2(computed.totalAssets)}</td></tr>
        <tr><td colspan="2" class="section">${t('equity')}</td></tr>
        <tr><td class="label" style="padding-left:24px">${t('openingEquity')}</td><td class="value">${fmt2(parseManual(openingEquity))}</td></tr>
        <tr><td class="label" style="padding-left:24px">${t('ownerWithdrawal')}</td><td class="value">${fmt2(parseManual(ownerWithdrawal))}</td></tr>
        <tr><td class="label" style="padding-left:24px">${t('periodProfit')}</td><td class="value">${fmt2(computed.netProfit)}</td></tr>
        <tr class="total"><td class="label">${t('totalEquity')}</td><td class="value">${fmt2(computed.totalEquity)}</td></tr>
        <tr><td colspan="2" class="section">${t('liabilities')}</td></tr>
        <tr><td class="label" style="padding-left:24px">${t('vatPayable')}</td><td class="value">${fmt2(computed.vatPayable)}</td></tr>
        <tr class="total"><td class="label">${t('totalLiabilities')}</td><td class="value">${fmt2(computed.totalLiab)}</td></tr>
        <tr class="total"><td class="label">${t('totalEquityLiab')}</td><td class="value">${fmt2(computed.totalEL)}</td></tr>
      </table>
      <div class="footer">◆ ScandiNordic Pro v.2</div>
      </body></html>`;
    try {
      const { uri } = await Print.printToFileAsync({ html });
      await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: '.pdf' });
    } catch {}
  }, [computed, currency, endDate, fixedAssets, openingEquity, ownerWithdrawal, t]);

  useEffect(() => { load(); }, []);

  const computed = useMemo(() => {
    const e = new Date(endDate);
    const yearStart = new Date(e.getFullYear(), 0, 1);

    const yearTxs = transactions.filter(tx => {
      const d = new Date(tx.date);
      return d <= e && d >= yearStart;
    });
    const allToDate = transactions.filter(tx => new Date(tx.date) <= e);

    const netProfit = yearTxs.filter(t => t.type === 'income').reduce((s: number, t: any) => s + t.amount, 0)
                   - yearTxs.filter(t => t.type === 'expense').reduce((s: number, t: any) => s + t.amount, 0);

    const vatCollected = allToDate.filter(t => t.type === 'income').reduce((s: number, t: any) => s + t.amount * (t.vatRate || 0) / 100, 0);
    const vatPaidAmt   = allToDate.filter(t => t.type === 'expense').reduce((s: number, t: any) => s + t.amount * (t.vatRate || 0) / 100, 0);
    const vatPayable   = Math.max(0, vatCollected - vatPaidAmt);

    const receivables = invoices
      .filter(inv => inv.status === 'unpaid' || inv.status === 'overdue')
      .reduce((s: number, inv: any) => s + (inv.totalAmount || inv.amount || 0), 0);

    const parseManual = (v: string) => parseFloat(v.replace(',', '.')) || 0;
    const fa = parseManual(fixedAssets);
    const oe = parseManual(openingEquity);
    const ow = parseManual(ownerWithdrawal);

    const totalAssets = fa + receivables;
    const totalEquity = oe + ow + netProfit;
    const totalLiab   = vatPayable;
    const totalEL     = totalEquity + totalLiab;

    return { receivables, totalAssets, netProfit, totalEquity, vatPayable, totalLiab, totalEL };
  }, [transactions, invoices, endDate, fixedAssets, openingEquity, ownerWithdrawal]);

  const fmt = (v: number) => formatCurrency(v, currency);

  const s: RowStyles = {
    tableRow: styles.tableRow,
    totalRow: styles.totalRow,
    rowLabel: styles.rowLabel,
    rowValue: styles.rowValue,
    inlineInput: styles.inlineInput,
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: COLORS.background }}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 32 }]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
        <Pressable style={styles.back} onPress={() => router.back()}>
          <Feather name="arrow-left" size={18} color={COLORS.primary} />
          <Text style={styles.backText}>{t('reports')}</Text>
        </Pressable>
        <Text style={styles.badge}>◆ ScandiNordic Pro ◆</Text>
        <View style={styles.titleRow}>
          <Text style={styles.title}>{t('balanceSheet')} 📒</Text>
        </View>
        <View style={styles.divider} />

        {/* Period end date */}
        <View style={styles.periodCard}>
          <Text style={styles.periodTitle}>{t('periodEnd')}</Text>
          <Pressable style={styles.periodDateRow} onPress={() => setShowEndDatePicker(true)}>
            <Text style={[styles.periodDateText, { color: dateDirty ? COLORS.warning : COLORS.primary }]}>
              {pendingEndDate}
            </Text>
            <Feather name="calendar" size={15} color={COLORS.muted} />
          </Pressable>
          <Text style={styles.periodHint}>{t('changesNotSaved')}</Text>
        </View>
        <DatePickerModal
          visible={showEndDatePicker}
          value={pendingEndDate}
          onConfirm={d => { setPendingEndDate(d); setShowEndDatePicker(false); }}
          onCancel={() => setShowEndDatePicker(false)}
          title={t('periodEnd')}
        />

        {/* Table */}
        <View style={styles.table}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t('assets')}</Text>
          </View>
          <Row label={t('fixedAssets')} indent editable val={fixedAssets} onVal={setFixedAssets} fmt={fmt} s={s} />
          <Row label={t('receivables')} value={computed.receivables} indent fmt={fmt} s={s} />
          <Row label={t('totalAssets')} value={computed.totalAssets} isTotal fmt={fmt} s={s} />

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t('equity')}</Text>
          </View>
          <Row label={t('openingEquity')} indent editable val={openingEquity} onVal={setOpeningEquity} fmt={fmt} s={s} />
          <Row label={t('ownerWithdrawal')} indent editable val={ownerWithdrawal} onVal={setOwnerWithdrawal} fmt={fmt} s={s} />
          <Row label={t('periodProfit')} value={computed.netProfit} indent fmt={fmt} s={s} />
          <Row label={t('totalEquity')} value={computed.totalEquity} isTotal fmt={fmt} s={s} />

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t('liabilities')}</Text>
          </View>
          <Row label={t('vatPayable')} value={computed.vatPayable} indent fmt={fmt} s={s} />
          <Row label={t('totalLiabilities')} value={computed.totalLiab} isTotal fmt={fmt} s={s} />

          <Row label={t('totalEquityLiab')} value={computed.totalEL} isTotal fmt={fmt} s={s} />
        </View>

        {/* Highlight */}
        <View style={styles.highlightCard}>
          <Text style={styles.highlightLabel}>{t('totalEquityLiab')}</Text>
          <Text style={[styles.highlightValue, { color: COLORS.primary }]}>{fmt(computed.totalEL)}</Text>
        </View>

        {/* Save Data / Export PDF */}
        <View style={styles.actionRow}>
          <Pressable style={styles.saveDataBtn} onPress={handleSaveData}>
            <Feather name="save" size={16} color={COLORS.text} />
            <Text style={styles.saveDataBtnText}>{t('saveData')}</Text>
          </Pressable>
          <Pressable style={styles.exportPdfBtn} onPress={handleExportPDF}>
            <Feather name="file-text" size={16} color={COLORS.background} />
            <Text style={styles.exportPdfBtnText}>{t('exportPdf')}</Text>
          </Pressable>
        </View>

        <Text style={styles.version}>◆ ScandiNordic Pro v.2</Text>
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
  periodCard: {
    backgroundColor: COLORS.card, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border,
    padding: 14, gap: 8,
  },
  periodTitle: { fontSize: 10, color: COLORS.muted, textTransform: 'uppercase', letterSpacing: 1.5, fontWeight: '600' },
  periodDateRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: COLORS.input, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border,
    paddingHorizontal: 12, paddingVertical: 10,
  },
  periodDateText: { fontSize: 13, fontWeight: '700' },
  periodHint: { fontSize: 11, color: COLORS.muted, lineHeight: 15 },
  actionRow: { flexDirection: 'row', gap: 10 },
  saveDataBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderRadius: 14, borderWidth: 1, borderColor: COLORS.border,
    backgroundColor: COLORS.card, paddingVertical: 15,
  },
  saveDataBtnText: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  exportPdfBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderRadius: 14, backgroundColor: COLORS.primary, paddingVertical: 15,
  },
  exportPdfBtnText: { fontSize: 14, fontWeight: '700', color: COLORS.background },
  table: { backgroundColor: COLORS.card, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden' },
  sectionHeader: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 4 },
  sectionTitle: { fontSize: 9, color: COLORS.primary, textTransform: 'uppercase', letterSpacing: 1.5, fontWeight: '700' },
  tableRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 10 },
  totalRow: { backgroundColor: COLORS.surface },
  rowLabel: { fontSize: 12, color: COLORS.textSecondary, flex: 1, paddingRight: 8 },
  rowValue: { fontSize: 13, fontWeight: '600', color: COLORS.text },
  inlineInput: {
    backgroundColor: COLORS.input, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border,
    color: COLORS.text, fontSize: 13, paddingHorizontal: 8, paddingVertical: 6,
    minWidth: 90, textAlign: 'right',
  },
  highlightCard: {
    backgroundColor: COLORS.card, borderRadius: 16, borderWidth: 1, borderColor: COLORS.primary + '40',
    padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  highlightLabel: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  highlightValue: { fontSize: 18, fontWeight: '700', letterSpacing: -0.5 },
  version: { textAlign: 'center', fontSize: 9, color: COLORS.muted + '60', letterSpacing: 4 },
});
