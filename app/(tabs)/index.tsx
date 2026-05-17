import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, RefreshControl, useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { COLORS } from '@/constants/colors';
import { BarChart, ChartLegend } from '@/components/BarChart';
import { getTransactions, getSettings } from '@/lib/storage';
import { formatCents, addCents, subtractCents, multiplyCents, zeroCents, type Cents } from '@/lib/money';
import type { Transaction, Currency } from '@/lib/types';
import { useLanguage } from '@/contexts/LanguageContext';

type Period = 'month' | 'year' | 'all';

export default function DashboardScreen() {
  const styles = makeStyles();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { t } = useLanguage();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [currency, setCurrency] = useState<Currency>('EUR');
  const [period, setPeriod] = useState<Period>('all');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const [tx, s] = await Promise.all([getTransactions(), getSettings()]);
    setTransactions(tx);
    setCurrency(s.currency);
  }, []);

  useEffect(() => { load(); }, []);
  const onRefresh = useCallback(async () => { setRefreshing(true); await load(); setRefreshing(false); }, [load]);

  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];

  const filtered = useMemo(() => {
    if (period === 'month') {
      return transactions.filter(tx => {
        const d = new Date(tx.date);
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      });
    }
    if (period === 'year') {
      return transactions.filter(tx => new Date(tx.date).getFullYear() === now.getFullYear());
    }
    return transactions;
  }, [transactions, period]);

  const income = useMemo(
    () => filtered.filter(tx => tx.type === 'income').reduce((s, tx) => addCents(s, tx.amountCents), zeroCents()),
    [filtered],
  );
  const expense = useMemo(
    () => filtered.filter(tx => tx.type === 'expense').reduce((s, tx) => addCents(s, tx.amountCents), zeroCents()),
    [filtered],
  );
  const profit = subtractCents(income, expense);

  const vatCollected = useMemo(
    () => filtered.filter(tx => tx.type === 'income').reduce(
      (s, tx) => addCents(s, multiplyCents(tx.amountCents, (tx.vatRate || 0) / 100)),
      zeroCents(),
    ),
    [filtered],
  );
  const vatPaid = useMemo(
    () => filtered.filter(tx => tx.type === 'expense').reduce(
      (s, tx) => addCents(s, multiplyCents(tx.amountCents, (tx.vatRate || 0) / 100)),
      zeroCents(),
    ),
    [filtered],
  );
  const netVat = subtractCents(vatCollected, vatPaid);

  const todayIncome = useMemo(
    () => transactions.filter(tx => tx.type === 'income' && tx.date.startsWith(todayStr)).reduce((s, tx) => addCents(s, tx.amountCents), zeroCents()),
    [transactions, todayStr],
  );
  const todayExpense = useMemo(
    () => transactions.filter(tx => tx.type === 'expense' && tx.date.startsWith(todayStr)).reduce((s, tx) => addCents(s, tx.amountCents), zeroCents()),
    [transactions, todayStr],
  );

  const chartData = useMemo(() =>
    Array.from({ length: 6 }).map((_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      const monthTx = transactions.filter(tx => {
        const td = new Date(tx.date);
        return td.getMonth() === d.getMonth() && td.getFullYear() === d.getFullYear();
      });
      return {
        label: d.toLocaleString('default', { month: 'short' }),
        income: monthTx.filter(tx => tx.type === 'income').reduce((s, tx) => addCents(s, tx.amountCents), zeroCents()),
        expense: monthTx.filter(tx => tx.type === 'expense').reduce((s, tx) => addCents(s, tx.amountCents), zeroCents()),
      };
    }),
    [transactions],
  );

  const recent = useMemo(
    () => [...transactions].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 5),
    [transactions],
  );

  const chartWidth = width - 64;

  const PERIODS: { key: Period; label: string }[] = [
    { key: 'month', label: t('thisMonth') },
    { key: 'year', label: t('thisYear') },
    { key: 'all', label: t('allTime') },
  ];

  const stats = [
    { label: t('totalIncome'),   value: formatCents(income, currency),  color: COLORS.success, emoji: '📈', href: '/(tabs)/transactions' },
    { label: t('totalExpenses'), value: formatCents(expense, currency), color: COLORS.danger,  emoji: '📉', href: '/(tabs)/transactions' },
  ];

  const actions = [
    { label: t('newInvoice'),    emoji: '📄', color: COLORS.accent,   onPress: () => router.push('/(tabs)/invoices') },
    { label: 'Sales',             emoji: '📊', color: COLORS.success,  onPress: () => router.push('/sales') },
    { label: t('scanReceipt'),   emoji: '📷', color: COLORS.primary,  onPress: () => router.push('/(tabs)/transactions?action=scan') },
    { label: t('uploadReceipt'), emoji: '📁', color: COLORS.info,     onPress: () => router.push('/(tabs)/transactions?action=upload') },
    { label: t('startJourney'),  emoji: '🚗', color: COLORS.success,  onPress: () => router.push('/reports/mileage') },
    { label: 'Sales Report',      emoji: '📑', color: COLORS.primary,  onPress: () => router.push('/sales-report') },
  ];

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: COLORS.background }}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 100 }]}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
    >
      {/* Header */}
      <Text style={styles.badge}>◆ ScandiNordic Pro ◆</Text>
      <Text style={styles.title}>{t('dashboard')}</Text>
      <View style={styles.divider} />

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

      {/* Hero Net Profit */}
      <View style={styles.heroCard}>
        <Text style={styles.heroLabel}>{t('netProfit')}</Text>
        <Text style={[styles.heroValue, { color: profit >= 0 ? COLORS.success : COLORS.danger }]}>
          {formatCents(profit, currency)}
        </Text>
        <View style={styles.todayRow}>
          <View style={styles.todayBadgeGreen}>
            <View style={[styles.todayDot, { backgroundColor: COLORS.success }]} />
            <Text style={[styles.todayText, { color: COLORS.success }]}>
              {t('todayIn')}: {formatCents(todayIncome, currency)}
            </Text>
          </View>
          <View style={styles.todayBadgeRed}>
            <View style={[styles.todayDot, { backgroundColor: COLORS.danger }]} />
            <Text style={[styles.todayText, { color: COLORS.danger }]}>
              {t('todayOut')}: {formatCents(todayExpense, currency)}
            </Text>
          </View>
        </View>
      </View>

      {/* Stats grid */}
      <View style={styles.grid}>
        {stats.map(s => (
          <Pressable
            key={s.label}
            style={({ pressed }) => [styles.statCard, pressed && { opacity: 0.75 }]}
            onPress={() => router.push(s.href as any)}
          >
            <View style={[styles.statBlob, { backgroundColor: s.color + '28' }]} />
            <View style={[styles.statAccent, { backgroundColor: s.color }]} />
            <Text style={styles.statEmoji}>{s.emoji}</Text>
            <Text style={styles.statLabel}>{s.label}</Text>
            <Text style={[styles.statValue, { color: s.color }]}>{s.value}</Text>
          </Pressable>
        ))}
      </View>

      {/* Action grid */}
      <View style={styles.actionGrid}>
        {actions.map(a => (
          <Pressable
            key={a.label}
            style={({ pressed }) => [styles.actionCard, pressed && { opacity: 0.75 }]}
            onPress={a.onPress}
          >
            <View style={[styles.actionBlob, { backgroundColor: a.color + '22' }]} />
            <Text style={styles.actionEmoji}>{a.emoji}</Text>
            <Text style={styles.actionLabel}>{a.label}</Text>
          </Pressable>
        ))}
      </View>

      {/* 6-month chart */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t('chart')}</Text>
        <BarChart data={chartData} width={chartWidth} height={140} />
        <ChartLegend />
      </View>

      {/* Recent transactions */}
      {recent.length > 0 && (
        <View style={styles.card}>
          <View style={styles.cardRow}>
            <Text style={styles.cardTitle}>{t('recentTransactions')}</Text>
            <Pressable onPress={() => router.push('/(tabs)/transactions')}>
              <Text style={styles.seeAll}>{t('seeAll')}</Text>
            </Pressable>
          </View>
          {recent.map(tx => {
            const isIncome = tx.type === 'income';
            const color = isIncome ? COLORS.success : COLORS.danger;
            const date = new Date(tx.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
            return (
              <View key={tx.id} style={styles.txRow}>
                <View style={[styles.txIcon, { backgroundColor: color + '18' }]}>
                  <Feather name={isIncome ? 'arrow-up' : 'arrow-down'} size={14} color={color} />
                </View>
                <View style={styles.txInfo}>
                  <Text style={styles.txDesc} numberOfLines={1}>{tx.description}</Text>
                  <Text style={styles.txMeta}>{tx.category} · {date}</Text>
                </View>
                <Text style={[styles.txAmount, { color }]}>
                  {isIncome ? '+' : '-'}{formatCents(tx.amountCents, currency)}
                </Text>
              </View>
            );
          })}
        </View>
      )}

      <Text style={styles.version}>◆ ScandiNordic pro v.2</Text>
    </ScrollView>
  );
}

const makeStyles = () => StyleSheet.create({
  content: { paddingHorizontal: 20, gap: 16 },
  badge: { fontSize: 9, color: COLORS.primary, letterSpacing: 4, textTransform: 'uppercase' },
  title: { fontSize: 30, fontWeight: '700', color: COLORS.text, letterSpacing: -0.5, marginTop: 4 },
  divider: { height: 1, backgroundColor: COLORS.border, marginTop: 12 },
  periodRow: { flexDirection: 'row', gap: 6 },
  periodBtn: {
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 99,
    borderWidth: 1, borderColor: COLORS.border,
  },
  periodBtnActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  periodLabel: { fontSize: 10, color: COLORS.muted, textTransform: 'uppercase', letterSpacing: 1, fontWeight: '500' },
  periodLabelActive: { color: COLORS.background },
  heroCard: {
    backgroundColor: COLORS.card, borderRadius: 20, padding: 20,
    borderWidth: 1, borderColor: COLORS.border,
  },
  heroLabel: { fontSize: 10, color: COLORS.muted, textTransform: 'uppercase', letterSpacing: 2, fontWeight: '500' },
  heroValue: { fontSize: 44, fontWeight: '700', letterSpacing: -1.5, marginTop: 6 },
  todayRow: { flexDirection: 'row', gap: 8, marginTop: 14, flexWrap: 'wrap' },
  todayBadgeGreen: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99,
    backgroundColor: COLORS.successDim, borderWidth: 1, borderColor: COLORS.success + '30',
  },
  todayBadgeRed: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99,
    backgroundColor: COLORS.dangerDim, borderWidth: 1, borderColor: COLORS.danger + '30',
  },
  todayDot: { width: 6, height: 6, borderRadius: 3 },
  todayText: { fontSize: 10, fontWeight: '600' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  statCard: {
    width: '47.5%', backgroundColor: COLORS.card, borderRadius: 14,
    padding: 14, borderWidth: 1, borderColor: COLORS.border, gap: 6,
    overflow: 'hidden',
  },
  statBlob: {
    position: 'absolute', top: -10, right: -10,
    width: 64, height: 64, borderRadius: 32,
  },
  statAccent: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    height: 2, opacity: 0.35,
  },
  statEmoji: { fontSize: 22 },
  statLabel: { fontSize: 10, color: COLORS.muted, textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: '500' },
  statValue: { fontSize: 16, fontWeight: '700', letterSpacing: -0.3 },
  card: {
    backgroundColor: COLORS.card, borderRadius: 16,
    borderWidth: 1, borderColor: COLORS.border, padding: 16, gap: 12,
  },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: 10, color: COLORS.textSecondary, textTransform: 'uppercase', letterSpacing: 1.5, fontWeight: '600' },
  seeAll: { fontSize: 11, color: COLORS.primary, fontWeight: '500' },
  txRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingTop: 10, borderTopWidth: 1, borderTopColor: COLORS.border,
  },
  txIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  txInfo: { flex: 1, gap: 2 },
  txDesc: { fontSize: 13, fontWeight: '500', color: COLORS.text },
  txMeta: { fontSize: 10, color: COLORS.muted },
  txAmount: { fontSize: 13, fontWeight: '700', letterSpacing: -0.3 },
  version: { textAlign: 'center', fontSize: 9, color: COLORS.muted + '80', letterSpacing: 4 },
  actionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  actionCard: {
    width: '30.5%', backgroundColor: COLORS.card, borderRadius: 14,
    padding: 14, borderWidth: 1, borderColor: COLORS.border, gap: 6, overflow: 'hidden', alignItems: 'flex-start',
  },
  actionBlob: { position: 'absolute', top: -8, right: -8, width: 50, height: 50, borderRadius: 25 },
  actionEmoji: { fontSize: 20 },
  actionLabel: { fontSize: 10, fontWeight: '600', color: COLORS.textSecondary, letterSpacing: 0.3 },
});
