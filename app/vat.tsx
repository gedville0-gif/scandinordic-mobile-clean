import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { COLORS } from '@/constants/colors';
import { getTransactions, getSettings } from '@/lib/storage';
import { formatCents, addCents, subtractCents, multiplyCents, zeroCents, computeVatFromGross } from '@/lib/money';
import type { Transaction, Currency } from '@/lib/types';
import { useLanguage } from '@/contexts/LanguageContext';

type Period = 'month' | 'quarter' | 'year';

export default function VATScreen() {
  const styles = makeStyles();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [currency, setCurrency] = useState<Currency>('EUR');
  const [period, setPeriod] = useState<Period>('month');
  const [refreshing, setRefreshing] = useState(false);

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
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      });
    }
    if (period === 'quarter') {
      const q = Math.floor(now.getMonth() / 3);
      const qs = new Date(now.getFullYear(), q * 3, 1);
      const qe = new Date(now.getFullYear(), q * 3 + 3, 0);
      return transactions.filter(tx => { const d = new Date(tx.date); return d >= qs && d <= qe; });
    }
    // year
    return transactions.filter(tx => new Date(tx.date).getFullYear() === now.getFullYear());
  }, [transactions, period]);

  const vatCollected = useMemo(
    () => filtered.filter(tx => tx.type === 'income' && tx.vatRate != null).reduce(
      (s, tx) => addCents(s, multiplyCents(tx.amountCents, (tx.vatRate ?? 0) / 100)),
      zeroCents(),
    ),
    [filtered],
  );
  const vatPaid = useMemo(
    () => filtered
      .filter(tx => tx.type === 'expense' && (tx.vatRate != null || (tx.vatRows && tx.vatRows.length > 0)))
      .reduce((s, tx) => {
        if (tx.vatRows && tx.vatRows.length >= 2) {
          return addCents(s, tx.vatRows.reduce(
            (rowSum, row) => addCents(rowSum, computeVatFromGross(row.grossAmountCents, row.vatRate).vat),
            zeroCents(),
          ));
        }
        return addCents(s, multiplyCents(tx.amountCents, (tx.vatRate ?? 0) / 100));
      }, zeroCents()),
    [filtered],
  );
  const vatPayable = subtractCents(vatCollected, vatPaid);

  // Breakdown by VAT rate
  const rateBreakdown = useMemo(() => {
    const rates = [0, 10, 13.5, 25.5];
    return rates.map(rate => {
      const collected = filtered.filter(tx => tx.type === 'income' && (tx.vatRate || 0) === rate)
        .reduce((s, tx) => addCents(s, multiplyCents(tx.amountCents, rate / 100)), zeroCents());
      const paid = filtered.filter(tx => tx.type === 'expense')
        .reduce((s, tx) => {
          if (tx.vatRows && tx.vatRows.length >= 2) {
            const row = tx.vatRows.find(r => r.vatRate === rate);
            if (!row) return s;
            return addCents(s, computeVatFromGross(row.grossAmountCents, rate).vat);
          }
          if ((tx.vatRate || 0) !== rate) return s;
          return addCents(s, multiplyCents(tx.amountCents, rate / 100));
        }, zeroCents());
      return { rate, collected, paid, net: subtractCents(collected, paid) };
    }).filter(r => r.collected > 0 || r.paid > 0);
  }, [filtered]);

  // VAT due date
  const vatDue = now.getDate() <= 12
    ? new Date(now.getFullYear(), now.getMonth(), 12)
    : new Date(now.getFullYear(), now.getMonth() + 1, 12);
  const vatDueStr = vatDue.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const daysUntilDue = Math.ceil((vatDue.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  // Recent transactions with VAT
  const vatTxs = useMemo(
    () => [...filtered].filter(tx => tx.vatRate != null || (tx.vatRows && tx.vatRows.length > 0))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 10),
    [filtered],
  );

  const PERIODS: { key: Period; label: string }[] = [
    { key: 'month', label: t('thisMonth') },
    { key: 'quarter', label: t('quarterly') },
    { key: 'year', label: t('thisYear') },
  ];

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: COLORS.background }}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 40 }]}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
    >
      {/* Header */}
      <View style={styles.headerRow}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Feather name="arrow-left" size={18} color={COLORS.text} />
        </Pressable>
        <View>
          <Text style={styles.badge}>◆ ScandiNordic Pro ◆</Text>
          <Text style={styles.title}>{t('vatSummary')}</Text>
        </View>
      </View>
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

      {/* VAT Due Date */}
      <View style={styles.dueCard}>
        <View style={styles.dueLeft}>
          <View style={styles.dueDateBox}>
            <Text style={styles.dueDateMonth}>
              {vatDue.toLocaleDateString('en', { month: 'short' }).toUpperCase()}
            </Text>
            <Text style={styles.dueDateDay}>12</Text>
          </View>
          <View>
            <Text style={styles.dueLabel}>{t('vatDue')}</Text>
            <Text style={styles.dueStr}>{vatDueStr}</Text>
            <Text style={styles.dueDays}>
              {daysUntilDue < 0 ? `${Math.abs(daysUntilDue)}d overdue` : `${daysUntilDue}d remaining`}
            </Text>
          </View>
        </View>
        <View style={[
          styles.dueBadge,
          daysUntilDue < 0 ? styles.overdueStyle :
          daysUntilDue <= 7 ? styles.soonStyle : styles.upcomingStyle,
        ]}>
          <Text style={[
            styles.dueBadgeText,
            { color: daysUntilDue < 0 ? COLORS.danger : daysUntilDue <= 7 ? COLORS.primary : COLORS.muted },
          ]}>
            {daysUntilDue < 0 ? 'Overdue' : daysUntilDue <= 7 ? t('dueSoon') : t('upcoming')}
          </Text>
        </View>
      </View>

      {/* VAT Summary cards */}
      <View style={styles.triRow}>
        <View style={styles.triCard}>
          <Text style={styles.triLabel}>{t('vatCollected')}</Text>
          <Text style={[styles.triValue, { color: COLORS.success }]}>{formatCents(vatCollected, currency)}</Text>
        </View>
        <View style={styles.triCard}>
          <Text style={styles.triLabel}>{t('vatPaid')}</Text>
          <Text style={[styles.triValue, { color: COLORS.danger }]}>{formatCents(vatPaid, currency)}</Text>
        </View>
        <View style={[styles.triCard, styles.triCardHighlight]}>
          <Text style={styles.triLabel}>{t('vatPayable')}</Text>
          <Text style={[styles.triValue, { color: vatPayable >= 0 ? COLORS.text : COLORS.success }]}>
            {formatCents(vatPayable, currency)}
          </Text>
        </View>
      </View>

      {/* Breakdown by rate */}
      {rateBreakdown.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('breakdownByRate')}</Text>
          <View style={styles.rateHeader}>
            <Text style={[styles.rateCell, { flex: 0.8 }]}>{t('vatPercent')}</Text>
            <Text style={[styles.rateCell, { color: COLORS.success + 'aa', textAlign: 'right' }]}>Collected</Text>
            <Text style={[styles.rateCell, { color: COLORS.danger + 'aa', textAlign: 'right' }]}>Paid</Text>
            <Text style={[styles.rateCell, { textAlign: 'right' }]}>Net</Text>
          </View>
          {rateBreakdown.map(r => (
            <View key={r.rate} style={styles.rateRow}>
              <Text style={[styles.rateVal, { flex: 0.8, fontWeight: '700' }]}>{r.rate}%</Text>
              <Text style={[styles.rateVal, { color: COLORS.success, textAlign: 'right' }]}>
                {formatCents(r.collected, currency)}
              </Text>
              <Text style={[styles.rateVal, { color: COLORS.danger, textAlign: 'right' }]}>
                {formatCents(r.paid, currency)}
              </Text>
              <Text style={[styles.rateVal, { fontWeight: '700', textAlign: 'right' }]}>
                {formatCents(r.net, currency)}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Transaction list */}
      {vatTxs.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Transactions</Text>
          {vatTxs.map(tx => {
            const isIncome = tx.type === 'income';
            const color = isIncome ? COLORS.success : COLORS.danger;
            const vatAmt = tx.vatRows && tx.vatRows.length >= 2
              ? tx.vatRows.reduce(
                  (s, row) => addCents(s, computeVatFromGross(row.grossAmountCents, row.vatRate).vat),
                  zeroCents(),
                )
              : multiplyCents(tx.amountCents, (tx.vatRate || 0) / 100);
            const date = new Date(tx.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
            return (
              <View key={tx.id} style={styles.txRow}>
                <View style={[styles.txIcon, { backgroundColor: color + '18' }]}>
                  <Text style={[styles.txArrow, { color }]}>{isIncome ? '↑' : '↓'}</Text>
                </View>
                <View style={styles.txInfo}>
                  <Text style={styles.txDesc} numberOfLines={1}>{tx.description}</Text>
                  <Text style={styles.txMeta}>{date} · {tx.vatRows && tx.vatRows.length >= 2 ? 'Mixed' : `${tx.vatRate}%`} {t('vatPercent')}</Text>
                </View>
                <View style={styles.txRight}>
                  <Text style={[styles.txVat, { color }]}>
                    {isIncome ? '+' : ''}{formatCents(vatAmt, currency)}
                  </Text>
                  <Text style={[styles.txType, { color: color + 'aa' }]}>
                    {isIncome ? 'Collected' : 'Paid'}
                  </Text>
                </View>
              </View>
            );
          })}
          {vatTxs.length === 0 && (
            <Text style={styles.empty}>No VAT transactions in this period.</Text>
          )}
        </View>
      )}

      {vatTxs.length === 0 && rateBreakdown.length === 0 && (
        <View style={styles.emptyState}>
          <Feather name="percent" size={32} color={COLORS.muted} />
          <Text style={styles.emptyText}>No VAT transactions in this period.</Text>
          <Text style={styles.emptySubText}>Add income or expense with a VAT rate to see data here.</Text>
        </View>
      )}

      <Text style={styles.version}>◆ ScandiNordic pro v.2</Text>
    </ScrollView>
  );
}

const makeStyles = () => StyleSheet.create({
  content: { paddingHorizontal: 16, gap: 16 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  backBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border,
    alignItems: 'center', justifyContent: 'center',
  },
  badge: { fontSize: 9, color: COLORS.primary, letterSpacing: 4, textTransform: 'uppercase' },
  title: { fontSize: 24, fontWeight: '700', color: COLORS.text, letterSpacing: -0.5, marginTop: 2 },
  divider: { height: 1, backgroundColor: COLORS.border },
  periodRow: { flexDirection: 'row', gap: 8 },
  periodBtn: {
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 99,
    borderWidth: 1, borderColor: COLORS.border,
  },
  periodBtnActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  periodLabel: { fontSize: 10, color: COLORS.muted, textTransform: 'uppercase', letterSpacing: 1, fontWeight: '500' },
  periodLabelActive: { color: COLORS.background },
  dueCard: {
    backgroundColor: COLORS.card, borderRadius: 16,
    borderWidth: 1, borderColor: COLORS.border, padding: 14,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  dueLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dueDateBox: {
    width: 44, height: 44, borderRadius: 10,
    backgroundColor: COLORS.primaryDim, borderWidth: 1, borderColor: COLORS.primary + '30',
    alignItems: 'center', justifyContent: 'center',
  },
  dueDateMonth: { fontSize: 7, fontWeight: '700', color: COLORS.primary, letterSpacing: 0.5 },
  dueDateDay: { fontSize: 18, fontWeight: '700', color: COLORS.text, lineHeight: 22 },
  dueLabel: { fontSize: 9, color: COLORS.muted, textTransform: 'uppercase', letterSpacing: 1, fontWeight: '500' },
  dueStr: { fontSize: 13, fontWeight: '600', color: COLORS.text, marginTop: 2 },
  dueDays: { fontSize: 10, color: COLORS.muted, marginTop: 1 },
  dueBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99, borderWidth: 1 },
  overdueStyle: { backgroundColor: COLORS.dangerDim, borderColor: COLORS.danger + '30' },
  soonStyle: { backgroundColor: COLORS.primaryDim, borderColor: COLORS.primary + '30' },
  upcomingStyle: { backgroundColor: COLORS.card, borderColor: COLORS.border },
  dueBadgeText: { fontSize: 9, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  triRow: { flexDirection: 'row', gap: 8 },
  triCard: {
    flex: 1, backgroundColor: COLORS.card, borderRadius: 14,
    borderWidth: 1, borderColor: COLORS.border, padding: 12, gap: 6,
    alignItems: 'center',
  },
  triCardHighlight: { borderColor: COLORS.primary + '30', backgroundColor: COLORS.primaryDim },
  triLabel: { fontSize: 9, color: COLORS.muted, textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: '500', textAlign: 'center' },
  triValue: { fontSize: 14, fontWeight: '700', letterSpacing: -0.3, textAlign: 'center' },
  card: {
    backgroundColor: COLORS.card, borderRadius: 16,
    borderWidth: 1, borderColor: COLORS.border, padding: 16, gap: 10,
  },
  cardTitle: { fontSize: 10, color: COLORS.textSecondary, textTransform: 'uppercase', letterSpacing: 1.5, fontWeight: '600' },
  rateHeader: { flexDirection: 'row', gap: 4, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  rateCell: { flex: 1, fontSize: 9, color: COLORS.muted, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: '600' },
  rateRow: { flexDirection: 'row', gap: 4, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: COLORS.border + '80' },
  rateVal: { flex: 1, fontSize: 12, color: COLORS.text },
  txRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingTop: 10, borderTopWidth: 1, borderTopColor: COLORS.border,
  },
  txIcon: { width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  txArrow: { fontSize: 15, fontWeight: '700' },
  txInfo: { flex: 1, gap: 2 },
  txDesc: { fontSize: 13, fontWeight: '500', color: COLORS.text },
  txMeta: { fontSize: 10, color: COLORS.muted },
  txRight: { alignItems: 'flex-end', gap: 2 },
  txVat: { fontSize: 13, fontWeight: '700', letterSpacing: -0.3 },
  txType: { fontSize: 9, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  empty: { fontSize: 13, color: COLORS.muted },
  emptyState: { alignItems: 'center', gap: 10, paddingVertical: 32 },
  emptyText: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  emptySubText: { fontSize: 12, color: COLORS.muted, textAlign: 'center', lineHeight: 18 },
  version: { textAlign: 'center', fontSize: 9, color: COLORS.muted + '80', letterSpacing: 4 },
});
