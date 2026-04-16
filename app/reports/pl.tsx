import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { COLORS } from '@/constants/colors';
import { useLanguage } from '@/contexts/LanguageContext';
import { getTransactions, getSettings } from '@/lib/storage';
import { formatCurrency } from '@/lib/currency';
import type { Transaction, Currency } from '@/lib/types';
import DatePickerModal from '@/components/DatePickerModal';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

const PL_DATES_KEY = 'pl_period_dates';

const PURCHASE_CATS  = new Set(['materials','equipment','groceries','purchases','supplies','fuel']);
const PAYROLL_CATS   = new Set(['payroll','salary','wages','salaries','staff']);
const PENSION_CATS   = new Set(['pension','employer_contribution','pension_cost']);
const DEPREC_CATS    = new Set(['depreciation','assets','amortization','fixed_assets']);
const FINANCIAL_CATS = new Set(['finance','interest','bank','loan','financial','banking']);

export default function PLScreen() {
  const styles = makeStyles();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const now = new Date();
  const defaultStart = `${now.getFullYear()}-01-01`;
  const defaultEnd = now.toISOString().split('T')[0];
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [currency, setCurrency] = useState<Currency>('EUR');
  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(defaultEnd);
  const [pendingStart, setPendingStart] = useState(defaultStart);
  const [pendingEnd, setPendingEnd] = useState(defaultEnd);
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const periodDirty = pendingStart !== startDate || pendingEnd !== endDate;

  const load = useCallback(async () => {
    const [tx, s, savedDates] = await Promise.all([
      getTransactions(), getSettings(),
      AsyncStorage.getItem(PL_DATES_KEY),
    ]);
    setTransactions(tx);
    setCurrency(s.currency);
    if (savedDates) {
      try {
        const { start, end } = JSON.parse(savedDates);
        if (start) { setStartDate(start); setPendingStart(start); }
        if (end)   { setEndDate(end);   setPendingEnd(end);   }
      } catch {}
    }
  }, []);

  const handleSaveData = useCallback(async () => {
    setStartDate(pendingStart);
    setEndDate(pendingEnd);
    await AsyncStorage.setItem(PL_DATES_KEY, JSON.stringify({ start: pendingStart, end: pendingEnd }));
  }, [pendingStart, pendingEnd]);

  useEffect(() => { load(); }, []);

  const computed = useMemo(() => {
    const s = new Date(startDate);
    const e = new Date(endDate);
    const period = transactions.filter(tx => {
      const d = new Date(tx.date);
      return d >= s && d <= e;
    });
    const income  = period.filter(tx => tx.type === 'income');
    const expense = period.filter(tx => tx.type === 'expense');

    const revenue   = income.reduce((s, t) => s + t.amount, 0);
    const purchases = expense.filter(t => PURCHASE_CATS.has(t.category)).reduce((s, t) => s + t.amount, 0);
    const payroll   = expense.filter(t => PAYROLL_CATS.has(t.category)).reduce((s, t) => s + t.amount, 0);
    const pension   = expense.filter(t => PENSION_CATS.has(t.category)).reduce((s, t) => s + t.amount, 0);
    const deprec    = expense.filter(t => DEPREC_CATS.has(t.category)).reduce((s, t) => s + t.amount, 0);
    const financial = expense.filter(t => FINANCIAL_CATS.has(t.category)).reduce((s, t) => s + t.amount, 0);
    const other     = expense.filter(t =>
      !PURCHASE_CATS.has(t.category) && !PAYROLL_CATS.has(t.category) &&
      !PENSION_CATS.has(t.category)  && !DEPREC_CATS.has(t.category)  &&
      !FINANCIAL_CATS.has(t.category)
    ).reduce((s, t) => s + t.amount, 0);

    const staffTotal  = payroll + pension;
    const opProfit    = revenue - purchases - staffTotal - deprec - other;
    const profitBT    = opProfit - financial;

    return { revenue, purchases, staffTotal, deprec, other, opProfit, financial, profitBT };
  }, [transactions, startDate, endDate]);

  const rows: { label: string; value: number; isExpense?: boolean; isTotal?: boolean; indent?: boolean }[] = [
    { label: t('revenue'),         value: computed.revenue,    isTotal: true },
    { label: t('purchases'),       value: computed.purchases,  isExpense: true, indent: true },
    { label: t('staffCosts'),      value: computed.staffTotal, isExpense: true, indent: true },
    { label: t('depreciation'),    value: computed.deprec,     isExpense: true, indent: true },
    { label: t('otherCosts'),      value: computed.other,      isExpense: true, indent: true },
    { label: t('operatingProfit'), value: computed.opProfit,   isTotal: true },
    { label: t('financialCosts'),  value: computed.financial,  isExpense: true, indent: true },
    { label: t('profitBeforeTax'), value: computed.profitBT,   isTotal: true },
    { label: t('periodProfit'),    value: computed.profitBT,   isTotal: true },
  ];

  const fmt = (v: number, isExpense?: boolean) =>
    (isExpense && v > 0 ? '- ' : '') + formatCurrency(Math.abs(v), currency);

  const handleExportPDF = useCallback(async () => {
    const fmtPdf = (v: number) => formatCurrency(Math.abs(v), currency);
    const sign = (v: number, isExp?: boolean) => (isExp && v > 0 ? '− ' : '') + fmtPdf(v);
    const entries: { label: string; value: number; isExpense: boolean; isTotal: boolean }[] = [
      { label: t('revenue'),         value: computed.revenue,    isExpense: false, isTotal: true  },
      { label: t('purchases'),       value: computed.purchases,  isExpense: true,  isTotal: false },
      { label: t('staffCosts'),      value: computed.staffTotal, isExpense: true,  isTotal: false },
      { label: t('depreciation'),    value: computed.deprec,     isExpense: true,  isTotal: false },
      { label: t('otherCosts'),      value: computed.other,      isExpense: true,  isTotal: false },
      { label: t('operatingProfit'), value: computed.opProfit,   isExpense: false, isTotal: true  },
      { label: t('financialCosts'),  value: computed.financial,  isExpense: true,  isTotal: false },
      { label: t('profitBeforeTax'), value: computed.profitBT,   isExpense: false, isTotal: true  },
      { label: t('periodProfit'),    value: computed.profitBT,   isExpense: false, isTotal: true  },
    ];
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/>
      <style>body{font-family:Helvetica,sans-serif;padding:32px;color:#111;}
      h1{font-size:22px;margin-bottom:4px;}
      .sub{color:#888;font-size:13px;margin-bottom:24px;}
      table{width:100%;border-collapse:collapse;}
      td{padding:9px 12px;border-bottom:1px solid #e8e8e8;font-size:13px;}
      .label{color:#444;} .value{text-align:right;font-weight:600;}
      .indent{padding-left:24px;color:#888;}
      .total{font-weight:700;background:#fafafa;}
      .neg{color:#cc2200;}
      .footer{margin-top:32px;font-size:11px;color:#aaa;text-align:center;}
      </style></head><body>
      <h1>${t('profitAndLoss')}</h1>
      <div class="sub">${startDate} – ${endDate}</div>
      <table>${entries.map(e => `<tr>
        <td class="${e.isTotal ? 'total' : 'indent'}">${e.label}</td>
        <td class="value ${e.isTotal ? 'total' : ''} ${e.isExpense && e.value > 0 ? 'neg' : ''}">${sign(e.value, e.isExpense)}</td>
      </tr>`).join('')}</table>
      <div class="footer">◆ ScandiNordic Pro v.2</div>
      </body></html>`;
    try {
      const { uri } = await Print.printToFileAsync({ html });
      await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: '.pdf' });
    } catch {}
  }, [computed, currency, startDate, endDate, t]);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: COLORS.background }}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 32 }]}
      showsVerticalScrollIndicator={false}
    >
        <Pressable style={styles.back} onPress={() => router.back()}>
          <Feather name="arrow-left" size={18} color={COLORS.primary} />
          <Text style={styles.backText}>{t('reports')}</Text>
        </Pressable>
        <Text style={styles.badge}>◆ ScandiNordic Pro ◆</Text>
        <View style={styles.titleRow}>
          <Text style={styles.title}>{t('profitAndLoss')} 📊</Text>
        </View>
        <View style={styles.divider} />

        {/* Period selector */}
        <View style={styles.periodCard}>
          <Text style={styles.periodTitle}>{t('period')}</Text>
          <View style={styles.periodRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>{t('periodStart')}</Text>
              <Pressable style={styles.periodDateRow} onPress={() => setShowStartPicker(true)}>
                <Text style={[styles.periodDateText, pendingStart !== startDate && { color: COLORS.warning }]}>
                  {pendingStart}
                </Text>
                <Feather name="calendar" size={14} color={COLORS.muted} />
              </Pressable>
            </View>
            <Text style={styles.periodDash}>–</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>{t('periodEnd')}</Text>
              <Pressable style={styles.periodDateRow} onPress={() => setShowEndPicker(true)}>
                <Text style={[styles.periodDateText, pendingEnd !== endDate && { color: COLORS.warning }]}>
                  {pendingEnd}
                </Text>
                <Feather name="calendar" size={14} color={COLORS.muted} />
              </Pressable>
            </View>
          </View>
          <Text style={styles.periodHint}>{t('changesNotSaved')}</Text>
        </View>
        <DatePickerModal
          visible={showStartPicker}
          value={pendingStart}
          onConfirm={d => { setPendingStart(d); setShowStartPicker(false); }}
          onCancel={() => setShowStartPicker(false)}
          title={t('periodStart')}
        />
        <DatePickerModal
          visible={showEndPicker}
          value={pendingEnd}
          onConfirm={d => { setPendingEnd(d); setShowEndPicker(false); }}
          onCancel={() => setShowEndPicker(false)}
          title={t('periodEnd')}
        />

        {/* P&L table */}
        <View style={styles.table}>
          {rows.map((row, i) => (
            <View
              key={i}
              style={[
                styles.tableRow,
                row.isTotal && styles.totalRow,
                i > 0 && { borderTopWidth: 1, borderTopColor: COLORS.border },
              ]}
            >
              <Text style={[
                styles.rowLabel,
                row.indent && { paddingLeft: 16, color: COLORS.muted },
                row.isTotal && { fontWeight: '700', color: COLORS.text, textTransform: 'uppercase', fontSize: 10, letterSpacing: 0.5 },
              ]}>
                {row.label}
              </Text>
              <Text style={[
                styles.rowValue,
                row.isExpense && row.value > 0 && { color: COLORS.danger },
                row.isTotal && { fontWeight: '700' },
                (row.label === t('operatingProfit') || row.label === t('profitBeforeTax') || row.label === t('periodProfit')) && {
                  color: row.value >= 0 ? COLORS.success : COLORS.danger,
                },
              ]}>
                {fmt(row.value, row.isExpense)}
              </Text>
            </View>
          ))}
        </View>

        {/* Net profit highlight */}
        <View style={[styles.highlightCard, { borderColor: computed.profitBT >= 0 ? COLORS.primary + '40' : COLORS.danger + '40' }]}>
          <Text style={styles.highlightLabel}>{t('periodProfit')}</Text>
          <Text style={[styles.highlightValue, { color: computed.profitBT >= 0 ? COLORS.primary : COLORS.danger }]}>
            {formatCurrency(computed.profitBT, currency)}
          </Text>
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
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  title: { fontSize: 24, fontWeight: '700', color: COLORS.text, letterSpacing: -0.5 },
  divider: { height: 1, backgroundColor: COLORS.border },
  periodCard: { backgroundColor: COLORS.card, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, padding: 14, gap: 10 },
  periodTitle: { fontSize: 10, color: COLORS.muted, textTransform: 'uppercase', letterSpacing: 1.5, fontWeight: '600' },
  periodRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  periodDash: { fontSize: 14, color: COLORS.muted, paddingBottom: 10 },
  fieldLabel: { fontSize: 9, color: COLORS.muted, textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: '600', marginBottom: 4 },
  periodDateRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: COLORS.input, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border,
    paddingHorizontal: 10, paddingVertical: 9,
  },
  periodDateText: { color: COLORS.primary, fontSize: 13, fontWeight: '700' },
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
  tableRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 11 },
  totalRow: { backgroundColor: COLORS.surface },
  rowLabel: { fontSize: 13, color: COLORS.textSecondary, flex: 1 },
  rowValue: { fontSize: 13, fontWeight: '600', color: COLORS.text, textAlign: 'right' },
  highlightCard: { backgroundColor: COLORS.card, borderRadius: 16, borderWidth: 1, padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  highlightLabel: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  highlightValue: { fontSize: 18, fontWeight: '700', letterSpacing: -0.5 },
  version: { textAlign: 'center', fontSize: 9, color: COLORS.muted + '60', letterSpacing: 4 },
});
