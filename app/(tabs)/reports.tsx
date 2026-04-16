import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, Pressable, RefreshControl, Modal,
} from 'react-native';
import Svg, { G, Path, Circle, Text as SvgText } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { COLORS } from '@/constants/colors';
import { getTransactions, getSettings } from '@/lib/storage';
import { formatCurrency } from '@/lib/currency';
import type { Transaction, Currency } from '@/lib/types';
import { useLanguage } from '@/contexts/LanguageContext';

type Period = 'month' | 'quarter' | 'year' | 'all';
type CatMode = 'income' | 'expense';

// Finnish income tax brackets (approximate)
const TAX_BRACKETS = [
  { label: '€0 – €19,900',      min: 0,     max: 19900,   rate: 0.1264 },
  { label: '€19,900 – €29,700', min: 19900, max: 29700,   rate: 0.19   },
  { label: '€29,700 – €49,000', min: 29700, max: 49000,   rate: 0.3025 },
  { label: '€49,000 – €85,800', min: 49000, max: 85800,   rate: 0.34   },
  { label: '€85,800+',          min: 85800, max: Infinity, rate: 0.44   },
];

function estimateTax(profit: number): number {
  const p = Math.max(0, profit);
  return TAX_BRACKETS.reduce((sum, b) => sum + Math.max(0, Math.min(p, b.max) - b.min) * b.rate, 0);
}

function catLabel(key: string, t: (k: string) => string): string {
  const catKey = 'cat_' + key;
  const translated = t(catKey);
  if (translated !== catKey) return translated;
  return key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' ');
}

// Palette for donut slices
const SLICE_COLORS = [
  COLORS.primary, '#34C759', '#FF9500', '#AF52DE', '#FF2D55',
  '#5AC8FA', '#FFCC00', '#FF6B35', '#1ABC9C', '#E74C3C',
];

interface SliceData { key: string; label: string; amount: number; pct: number; color: string; }

function buildSlices(map: Record<string, number>, total: number, otherLabel: string, t: (k: string) => string): SliceData[] {
  if (total === 0) return [];
  const OTHER_THRESHOLD = 0.04; // < 4% gets grouped
  const entries = Object.entries(map).sort(([, a], [, b]) => b - a);
  const main: SliceData[] = [];
  let otherTotal = 0;
  entries.forEach(([key, amount], i) => {
    const pct = amount / total;
    if (pct < OTHER_THRESHOLD || i >= 8) {
      otherTotal += amount;
    } else {
      main.push({ key, label: catLabel(key, t), amount, pct, color: SLICE_COLORS[main.length % SLICE_COLORS.length] });
    }
  });
  if (otherTotal > 0) {
    main.push({ key: '__other__', label: otherLabel, amount: otherTotal, pct: otherTotal / total, color: COLORS.muted + 'CC' });
  }
  return main;
}

// Donut chart component
function DonutChart({ slices, total, currency, size = 160 }: {
  slices: SliceData[]; total: number; currency: Currency; size?: number;
}) {
  const cx = size / 2;
  const cy = size / 2;
  const R = size * 0.38;
  const r = size * 0.24;
  const GAP = 0.03; // radians gap between slices

  if (slices.length === 0) {
    return (
      <Svg width={size} height={size}>
        <Circle cx={cx} cy={cy} r={R} stroke={COLORS.border} strokeWidth={R - r} fill="none" />
      </Svg>
    );
  }

  let angle = -Math.PI / 2;
  const paths = slices.map((s) => {
    const sweep = s.pct * 2 * Math.PI - GAP;
    const startAngle = angle + GAP / 2;
    const endAngle = startAngle + sweep;
    const x1 = cx + R * Math.cos(startAngle);
    const y1 = cy + R * Math.sin(startAngle);
    const x2 = cx + R * Math.cos(endAngle);
    const y2 = cy + R * Math.sin(endAngle);
    const xi1 = cx + r * Math.cos(startAngle);
    const yi1 = cy + r * Math.sin(startAngle);
    const xi2 = cx + r * Math.cos(endAngle);
    const yi2 = cy + r * Math.sin(endAngle);
    const large = sweep > Math.PI ? 1 : 0;
    const d = `M ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2} L ${xi2} ${yi2} A ${r} ${r} 0 ${large} 0 ${xi1} ${yi1} Z`;
    angle += s.pct * 2 * Math.PI;
    return { d, color: s.color };
  });

  const fmt = formatCurrency(total, currency);
  const fontSize = fmt.length > 8 ? 11 : fmt.length > 6 ? 13 : 15;

  return (
    <Svg width={size} height={size}>
      <G>
        {paths.map((p, i) => <Path key={i} d={p.d} fill={p.color} />)}
      </G>
      <SvgText
        x={cx} y={cy - 7}
        textAnchor="middle"
        fill={COLORS.text}
        fontSize={fontSize}
        fontWeight="700"
      >
        {fmt}
      </SvgText>
      <SvgText
        x={cx} y={cy + 10}
        textAnchor="middle"
        fill={COLORS.muted}
        fontSize={9}
      >
        TOTAL
      </SvgText>
    </Svg>
  );
}

export default function ReportsScreen() {
  const styles = makeStyles();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [currency, setCurrency] = useState<Currency>('EUR');
  const [period, setPeriod] = useState<Period>('year');
  const [refreshing, setRefreshing] = useState(false);
  const [catMode, setCatMode] = useState<CatMode>('income');
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [showYearPicker, setShowYearPicker] = useState(false);

  const load = useCallback(async () => {
    const [tx, s] = await Promise.all([getTransactions(), getSettings()]);
    setTransactions(tx);
    setCurrency(s.currency);
  }, []);

  useEffect(() => { load(); }, []);
  const onRefresh = useCallback(async () => { setRefreshing(true); await load(); setRefreshing(false); }, [load]);

  const now = new Date();

  const filtered = useMemo(() => {
    if (period === 'month') {
      return transactions.filter(tx => {
        const d = new Date(tx.date);
        return d.getMonth() === now.getMonth() && d.getFullYear() === selectedYear;
      });
    }
    if (period === 'quarter') {
      const q = Math.floor(now.getMonth() / 3);
      const qs = new Date(selectedYear, q * 3, 1);
      const qe = new Date(selectedYear, q * 3 + 3, 0);
      return transactions.filter(tx => { const d = new Date(tx.date); return d >= qs && d <= qe; });
    }
    if (period === 'year') {
      return transactions.filter(tx => new Date(tx.date).getFullYear() === selectedYear);
    }
    return transactions;
  }, [transactions, period, selectedYear]);

  const totalIncome = useMemo(() => filtered.filter(tx => tx.type === 'income').reduce((s, tx) => s + tx.amount, 0), [filtered]);
  const totalExpenses = useMemo(() => filtered.filter(tx => tx.type === 'expense').reduce((s, tx) => s + tx.amount, 0), [filtered]);
  const netProfit = totalIncome - totalExpenses;

  const vatCollected = useMemo(() => filtered.filter(tx => tx.type === 'income').reduce((s, tx) => s + tx.amount * (tx.vatRate || 0) / 100, 0), [filtered]);
  const vatPaid = useMemo(() => filtered.filter(tx => tx.type === 'expense').reduce((s, tx) => s + tx.amount * (tx.vatRate || 0) / 100, 0), [filtered]);
  const netVat = vatCollected - vatPaid;

  const taxEstimate = useMemo(() => estimateTax(netProfit), [netProfit]);

  const incomeByCategory: Record<string, number> = {};
  const expenseByCategory: Record<string, number> = {};
  filtered.forEach(tx => {
    if (tx.type === 'income') incomeByCategory[tx.category] = (incomeByCategory[tx.category] || 0) + tx.amount;
    else expenseByCategory[tx.category] = (expenseByCategory[tx.category] || 0) + tx.amount;
  });

  const catTotal = catMode === 'income' ? totalIncome : totalExpenses;
  const catMap = catMode === 'income' ? incomeByCategory : expenseByCategory;
  const catColor = catMode === 'income' ? COLORS.success : COLORS.danger;

  const slices = useMemo(
    () => buildSlices(catMap, catTotal, t('other'), t),
    [catMap, catTotal, catMode, t],
  );

  // VAT due date: 12th of next month (or this month if before 12th)
  const vatDue = now.getDate() <= 12
    ? new Date(now.getFullYear(), now.getMonth(), 12)
    : new Date(now.getFullYear(), now.getMonth() + 1, 12);
  const vatDueStr = vatDue.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const daysUntilDue = Math.ceil((vatDue.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  const PERIODS: { key: Period; label: string }[] = [
    { key: 'month', label: t('thisMonth') },
    { key: 'quarter', label: t('quarterly') },
    { key: 'year', label: t('thisYear') },
    { key: 'all', label: t('allTime') },
  ];

  const hasCategories = Object.keys(catMap).length > 0;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: COLORS.background }}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 100 }]}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
    >
      {/* Header */}
      <Text style={styles.badge}>◆ ScandiNordic Pro ◆</Text>
      <View style={styles.titleRow}>
        <Text style={styles.title}>{t('reports')}</Text>
        <Pressable style={styles.yearBadge} onPress={() => setShowYearPicker(true)}>
          <Text style={styles.yearBadgeText}>{selectedYear}</Text>
          <Feather name="chevron-down" size={11} color={COLORS.muted} />
        </Pressable>
      </View>
      <View style={styles.divider} />

      {/* Year picker modal */}
      <Modal visible={showYearPicker} transparent animationType="fade" onRequestClose={() => setShowYearPicker(false)}>
        <Pressable style={styles.yearOverlay} onPress={() => setShowYearPicker(false)}>
          <View style={styles.yearSheet}>
            <Text style={styles.yearSheetTitle}>{t('selectYear')}</Text>
            {Array.from({ length: 10 }, (_, i) => now.getFullYear() - 4 + i).map(yr => (
              <Pressable
                key={yr}
                style={[styles.yearOption, selectedYear === yr && styles.yearOptionActive]}
                onPress={() => { setSelectedYear(yr); setShowYearPicker(false); }}
              >
                <Text style={[styles.yearOptionText, selectedYear === yr && styles.yearOptionTextActive]}>
                  {yr}
                </Text>
                {selectedYear === yr && <Feather name="check" size={14} color={COLORS.primary} />}
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>

      {/* Period filter */}
      <View style={styles.periodRow}>
        {PERIODS.map(p => (
          <Pressable
            key={p.key}
            style={[styles.periodBtn, period === p.key && styles.periodBtnActive]}
            onPress={() => setPeriod(p.key)}
          >
            <Text style={[styles.periodLabel, period === p.key && styles.periodLabelActive]}>
              {p.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Summary */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t('summary')}</Text>
        <View style={styles.summaryGrid}>
          {[
            { label: t('totalIncome'), value: formatCurrency(totalIncome, currency), color: COLORS.success, icon: 'trending-up' },
            { label: t('totalExpenses'), value: formatCurrency(totalExpenses, currency), color: COLORS.danger, icon: 'trending-down' },
            { label: t('netProfit'), value: formatCurrency(netProfit, currency), color: netProfit >= 0 ? COLORS.success : COLORS.danger, icon: 'dollar-sign' },
            { label: t('netVat'), value: formatCurrency(netVat, currency), color: COLORS.info, icon: 'percent' },
          ].map(item => (
            <View key={item.label} style={styles.summaryItem}>
              <View style={[styles.summaryIcon, { backgroundColor: item.color + '18' }]}>
                <Feather name={item.icon as any} size={14} color={item.color} />
              </View>
              <Text style={styles.summaryLabel}>{item.label}</Text>
              <Text style={[styles.summaryValue, { color: item.color }]}>{item.value}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* VAT Due Date */}
      <Pressable style={styles.vatDueCard} onPress={() => router.push('/vat')}>
        <View style={styles.vatDueLeft}>
          <View style={styles.vatDateBox}>
            <Text style={styles.vatDateMonth}>
              {vatDue.toLocaleDateString('en', { month: 'short' }).toUpperCase()}
            </Text>
            <Text style={styles.vatDateDay}>12</Text>
          </View>
          <View>
            <Text style={styles.vatDueLabel}>{t('vatDue')}</Text>
            <Text style={styles.vatDueStr}>{vatDueStr}</Text>
          </View>
        </View>
        <View style={styles.vatDueRight}>
          <View style={[
            styles.vatDueBadge,
            daysUntilDue < 0 ? styles.vatOverdue :
            daysUntilDue <= 7 ? styles.vatSoon : styles.vatUpcoming,
          ]}>
            <Text style={[
              styles.vatDueBadgeText,
              daysUntilDue < 0 ? { color: COLORS.danger } :
              daysUntilDue <= 7 ? { color: COLORS.primary } : { color: COLORS.muted },
            ]}>
              {daysUntilDue < 0 ? t('overdue') : daysUntilDue <= 7 ? t('dueSoon') : t('upcoming')}
            </Text>
          </View>
          <Feather name="chevron-right" size={14} color={COLORS.muted} style={{ marginTop: 4 }} />
        </View>
      </Pressable>

      {/* Tax Estimate */}
      {netProfit > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('taxEstimate')}</Text>
          <View style={styles.taxRow}>
            <View style={[styles.taxItem, { borderRightWidth: 1, borderRightColor: COLORS.border }]}>
              <Text style={styles.taxLabel}>{t('netProfit')}</Text>
              <Text style={[styles.taxValue, { color: COLORS.text }]}>{formatCurrency(netProfit, currency)}</Text>
            </View>
            <View style={[styles.taxItem, { borderRightWidth: 1, borderRightColor: COLORS.border }]}>
              <Text style={styles.taxLabel}>{t('estimated')}</Text>
              <Text style={[styles.taxValue, { color: COLORS.danger }]}>{formatCurrency(taxEstimate, currency)}</Text>
            </View>
            <View style={styles.taxItem}>
              <Text style={styles.taxLabel}>{t('afterTax')}</Text>
              <Text style={[styles.taxValue, { color: netProfit - taxEstimate >= 0 ? COLORS.success : COLORS.danger }]}>
                {formatCurrency(Math.max(0, netProfit - taxEstimate), currency)}
              </Text>
            </View>
          </View>
          <Text style={styles.taxNote}>{t('taxNoteShort')}</Text>
        </View>
      )}

      {/* Category Breakdown */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t('categoryBreakdown')}</Text>
        {/* Segmented toggle */}
        <View style={styles.segToggle}>
          <Pressable
            style={[styles.segBtn, catMode === 'income' && styles.segBtnActiveIncome]}
            onPress={() => setCatMode('income')}
          >
            <Text style={[styles.segLabel, catMode === 'income' && styles.segLabelActiveIncome]}>
              {t('income')}
            </Text>
          </Pressable>
          <Pressable
            style={[styles.segBtn, catMode === 'expense' && styles.segBtnActiveExpense]}
            onPress={() => setCatMode('expense')}
          >
            <Text style={[styles.segLabel, catMode === 'expense' && styles.segLabelActiveExpense]}>
              {t('expenses')}
            </Text>
          </Pressable>
        </View>

        {hasCategories ? (
          <View style={styles.donutRow}>
            <DonutChart slices={slices} total={catTotal} currency={currency} size={150} />
            <View style={styles.legend}>
              {slices.map(s => (
                <View key={s.key} style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: s.color }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.legendLabel} numberOfLines={1}>{s.label}</Text>
                    <Text style={styles.legendSub}>{formatCurrency(s.amount, currency)}  {(s.pct * 100).toFixed(1)}%</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        ) : (
          <Text style={styles.noDataText}>
            {catMode === 'income' ? t('noTransactions') : t('noTransactions')}
          </Text>
        )}
      </View>

      {/* VAT detail link */}
      <Pressable style={({ pressed }) => [styles.vatLinkBtn, pressed && { opacity: 0.75 }]} onPress={() => router.push('/vat')}>
        <Feather name="percent" size={14} color={COLORS.primary} />
        <Text style={styles.vatLinkText}>{t('vatSummary')}</Text>
        <Feather name="chevron-right" size={14} color={COLORS.primary} />
      </Pressable>

      {/* Sub-report navigation */}
      <Text style={styles.subTitle}>{t('detailedReports')}</Text>
      <View style={styles.subGrid}>
        {[
          { label: t('mileage'),      emoji: '🚗', href: '/reports/mileage', color: COLORS.success },
          { label: t('profitAndLoss'),emoji: '📊', href: '/reports/pl',      color: COLORS.primary },
          { label: t('balanceSheet'), emoji: '📒', href: '/reports/balance', color: COLORS.info    },
          { label: t('taxPrepayment'),emoji: '💰', href: '/reports/tax',     color: COLORS.danger  },
        ].map(item => (
          <Pressable
            key={item.href}
            style={({ pressed }) => [styles.subCard, pressed && { opacity: 0.75 }]}
            onPress={() => router.push(item.href as any)}
          >
            <View style={[styles.subBlob, { backgroundColor: item.color + '22' }]} />
            <Text style={styles.subEmoji}>{item.emoji}</Text>
            <Text style={styles.subLabel}>{item.label}</Text>
            <Feather name="chevron-right" size={12} color={COLORS.muted} style={{ marginTop: 2 }} />
          </Pressable>
        ))}
      </View>

      <Text style={styles.version}>◆ ScandiNordic pro v.2</Text>
    </ScrollView>
  );
}

const makeStyles = () => StyleSheet.create({
  content: { paddingHorizontal: 16, gap: 16 },
  badge: { fontSize: 9, color: COLORS.primary, letterSpacing: 4, textTransform: 'uppercase' },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  title: { fontSize: 30, fontWeight: '700', color: COLORS.text, letterSpacing: -0.5 },
  yearBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99,
    backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border,
  },
  yearBadgeText: { fontSize: 11, fontWeight: '600', color: COLORS.muted },
  yearOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.92)',
    justifyContent: 'center', alignItems: 'center', padding: 40,
  },
  yearSheet: {
    backgroundColor: COLORS.card, borderRadius: 18,
    borderWidth: 1, borderColor: COLORS.primary + '40',
    paddingVertical: 8, width: '100%', maxWidth: 220,
  },
  yearSheetTitle: {
    fontSize: 10, fontWeight: '700', color: COLORS.primary,
    textTransform: 'uppercase', letterSpacing: 2,
    paddingHorizontal: 16, paddingVertical: 10, textAlign: 'center',
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  yearOption: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 13,
  },
  yearOptionActive: { backgroundColor: COLORS.primary + '25' },
  yearOptionText: { fontSize: 17, fontWeight: '500', color: COLORS.textSecondary },
  yearOptionTextActive: { color: COLORS.primary, fontWeight: '700', fontSize: 17 },
  divider: { height: 1, backgroundColor: COLORS.border },
  periodRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  periodBtn: {
    paddingHorizontal: 12, paddingVertical: 5, borderRadius: 99,
    borderWidth: 1, borderColor: COLORS.border,
  },
  periodBtnActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  periodLabel: { fontSize: 10, color: COLORS.muted, textTransform: 'uppercase', letterSpacing: 1, fontWeight: '500' },
  periodLabelActive: { color: COLORS.background },
  card: {
    backgroundColor: COLORS.card, borderRadius: 16,
    borderWidth: 1, borderColor: COLORS.border, padding: 16, gap: 12,
  },
  cardTitle: { fontSize: 10, color: COLORS.textSecondary, textTransform: 'uppercase', letterSpacing: 1.5, fontWeight: '600' },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  summaryItem: {
    width: '47.5%', backgroundColor: COLORS.cardElevated, borderRadius: 12,
    padding: 12, gap: 6, borderWidth: 1, borderColor: COLORS.border,
  },
  summaryIcon: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  summaryLabel: { fontSize: 10, color: COLORS.muted, textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: '500' },
  summaryValue: { fontSize: 15, fontWeight: '700', letterSpacing: -0.3 },
  vatDueCard: {
    backgroundColor: COLORS.card, borderRadius: 16,
    borderWidth: 1, borderColor: COLORS.border, padding: 14,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  vatDueLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  vatDateBox: {
    width: 44, height: 44, borderRadius: 10,
    backgroundColor: COLORS.primaryDim, borderWidth: 1, borderColor: COLORS.primary + '30',
    alignItems: 'center', justifyContent: 'center',
  },
  vatDateMonth: { fontSize: 7, fontWeight: '700', color: COLORS.primary, letterSpacing: 0.5 },
  vatDateDay: { fontSize: 18, fontWeight: '700', color: COLORS.text, lineHeight: 22 },
  vatDueLabel: { fontSize: 9, color: COLORS.muted, textTransform: 'uppercase', letterSpacing: 1, fontWeight: '500' },
  vatDueStr: { fontSize: 13, fontWeight: '600', color: COLORS.text, marginTop: 2 },
  vatDueRight: { alignItems: 'flex-end', gap: 4 },
  vatDueBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 99, borderWidth: 1 },
  vatOverdue: { backgroundColor: COLORS.dangerDim, borderColor: COLORS.danger + '30' },
  vatSoon: { backgroundColor: COLORS.primaryDim, borderColor: COLORS.primary + '30' },
  vatUpcoming: { backgroundColor: COLORS.card, borderColor: COLORS.border },
  vatDueBadgeText: { fontSize: 9, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  taxRow: { flexDirection: 'row', gap: 0 },
  taxItem: { flex: 1, alignItems: 'center', gap: 4 },
  taxLabel: { fontSize: 9, color: COLORS.muted, textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: '500', textAlign: 'center' },
  taxValue: { fontSize: 13, fontWeight: '700', letterSpacing: -0.3, textAlign: 'center' },
  taxNote: { fontSize: 10, color: COLORS.muted, lineHeight: 14 },
  // Category breakdown
  segToggle: {
    flexDirection: 'row', backgroundColor: COLORS.cardElevated,
    borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, padding: 3,
  },
  segBtn: { flex: 1, paddingVertical: 6, borderRadius: 8, alignItems: 'center' },
  segBtnActiveIncome: { backgroundColor: COLORS.success + '22' },
  segBtnActiveExpense: { backgroundColor: COLORS.danger + '22' },
  segLabel: { fontSize: 11, fontWeight: '600', color: COLORS.muted },
  segLabelActiveIncome: { color: COLORS.success },
  segLabelActiveExpense: { color: COLORS.danger },
  donutRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  legend: { flex: 1, gap: 8 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  legendDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  legendLabel: { fontSize: 12, fontWeight: '600', color: COLORS.text },
  legendSub: { fontSize: 10, color: COLORS.muted, marginTop: 1 },
  noDataText: { fontSize: 12, color: COLORS.muted, textAlign: 'center', paddingVertical: 16 },
  vatLinkBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: COLORS.primaryDim, borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: COLORS.primary + '30',
  },
  vatLinkText: { fontSize: 13, fontWeight: '600', color: COLORS.primary, flex: 1 },
  subTitle: { fontSize: 9, color: COLORS.muted, textTransform: 'uppercase', letterSpacing: 2, fontWeight: '600' },
  subGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  subCard: {
    width: '47.5%', backgroundColor: COLORS.card, borderRadius: 14,
    padding: 14, borderWidth: 1, borderColor: COLORS.border,
    gap: 6, overflow: 'hidden',
    flexDirection: 'row', alignItems: 'center',
  },
  subBlob: {
    position: 'absolute', top: -8, right: -8,
    width: 48, height: 48, borderRadius: 24,
  },
  subEmoji: { fontSize: 20 },
  subLabel: { fontSize: 11, fontWeight: '600', color: COLORS.text, flex: 1 },
  version: { textAlign: 'center', fontSize: 9, color: COLORS.muted + '80', letterSpacing: 4 },
});
