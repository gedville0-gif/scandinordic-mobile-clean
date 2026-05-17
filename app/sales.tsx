import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { COLORS } from '@/constants/colors';
import { getTransactions, getSettings } from '@/lib/storage';
import { formatCents, addCents, zeroCents } from '@/lib/money';
import type { Transaction, Currency } from '@/lib/types';
import DatePickerModal from '@/components/DatePickerModal';

export default function SalesScreen() {
  const styles = makeStyles();
  const insets = useSafeAreaInsets();
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const today = now.toISOString().split('T')[0];

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [currency, setCurrency] = useState<Currency>('EUR');
  const [startDate, setStartDate] = useState(monthStart);
  const [endDate, setEndDate] = useState(today);
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);

  const load = useCallback(async () => {
    try {
      const [tx, s] = await Promise.all([getTransactions(), getSettings()]);
      setTransactions(tx);
      setCurrency(s.currency);
    } catch {}
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const thisMonthTotal = useMemo(() => {
    const prefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    return transactions
      .filter(tx => tx.type === 'income' && tx.date.startsWith(prefix))
      .reduce((s, tx) => addCents(s, tx.amountCents), zeroCents());
  }, [transactions]);

  const sales = useMemo(() =>
    transactions
      .filter(tx => tx.type === 'income' && tx.date >= startDate && tx.date <= endDate)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [transactions, startDate, endDate],
  );

  const filteredTotal = useMemo(() => sales.reduce((s, tx) => addCents(s, tx.amountCents), zeroCents()), [sales]);

  return (
    <>
      <ScrollView
        style={{ flex: 1, backgroundColor: COLORS.background }}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        <Pressable
          style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.65 }]}
          onPress={() => router.back()}
        >
          <Feather name="chevron-left" size={18} color={COLORS.primary} />
          <Text style={styles.backText}>Dashboard</Text>
        </Pressable>

        <Text style={styles.badge}>◆ ScandiNordic Pro ◆</Text>
        <Text style={styles.title}>Sales</Text>
        <View style={styles.divider} />

        {/* This month hero */}
        <View style={styles.heroCard}>
          <Text style={styles.heroLabel}>SALES THIS MONTH</Text>
          <Text style={styles.heroValue}>{formatCents(thisMonthTotal, currency)}</Text>
          <Text style={styles.heroSub}>
            {transactions.filter(tx => {
              const prefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
              return tx.type === 'income' && tx.date.startsWith(prefix);
            }).length} transactions
          </Text>
        </View>

        {/* Date range filter */}
        <View style={styles.filterCard}>
          <Text style={styles.filterLabel}>DATE RANGE</Text>
          <View style={styles.filterRow}>
            <Pressable
              style={({ pressed }) => [styles.dateBtn, pressed && { opacity: 0.65 }]}
              onPress={() => setShowStartPicker(true)}
            >
              <Feather name="calendar" size={13} color={COLORS.primary} />
              <Text style={styles.dateBtnText}>{startDate}</Text>
            </Pressable>
            <Text style={styles.filterArrow}>→</Text>
            <Pressable
              style={({ pressed }) => [styles.dateBtn, pressed && { opacity: 0.65 }]}
              onPress={() => setShowEndPicker(true)}
            >
              <Feather name="calendar" size={13} color={COLORS.primary} />
              <Text style={styles.dateBtnText}>{endDate}</Text>
            </Pressable>
          </View>
        </View>

        {/* Filtered summary row */}
        <View style={styles.summaryBar}>
          <Text style={styles.summaryCount}>{sales.length} sale{sales.length !== 1 ? 's' : ''}</Text>
          <Text style={styles.summaryTotal}>{formatCents(filteredTotal, currency)}</Text>
        </View>

        {/* Sales list */}
        {sales.length === 0 ? (
          <View style={styles.emptyCard}>
            <Feather name="trending-up" size={28} color={COLORS.muted} />
            <Text style={styles.emptyText}>No sales in this period</Text>
          </View>
        ) : (
          <View style={styles.listCard}>
            {sales.map((tx, i) => {
              const date = new Date(tx.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
              return (
                <View key={tx.id} style={[styles.txRow, i === 0 && { borderTopWidth: 0, paddingTop: 0 }]}>
                  <View style={styles.txIconWrap}>
                    <Feather name="trending-up" size={14} color={COLORS.success} />
                  </View>
                  <View style={styles.txInfo}>
                    <Text style={styles.txDesc} numberOfLines={1}>{tx.description || '—'}</Text>
                    <Text style={styles.txMeta}>
                      {tx.category}{tx.vatRate ? ` · VAT ${tx.vatRate}%` : ''} · {date}
                    </Text>
                  </View>
                  <Text style={styles.txAmount}>{formatCents(tx.amountCents, currency)}</Text>
                </View>
              );
            })}
          </View>
        )}

        {/* Quick add */}
        <Pressable
          style={({ pressed }) => [styles.addBtn, pressed && { opacity: 0.85 }]}
          onPress={() => router.push('/(tabs)/transactions')}
        >
          <Feather name="plus" size={16} color={COLORS.background} />
          <Text style={styles.addBtnText}>Add Sale</Text>
        </Pressable>
      </ScrollView>

      {showStartPicker && (
        <DatePickerModal
          visible={showStartPicker}
          value={startDate}
          title="FROM DATE"
          onConfirm={d => { setStartDate(d); setShowStartPicker(false); }}
          onCancel={() => setShowStartPicker(false)}
        />
      )}
      {showEndPicker && (
        <DatePickerModal
          visible={showEndPicker}
          value={endDate}
          title="TO DATE"
          onConfirm={d => { setEndDate(d); setShowEndPicker(false); }}
          onCancel={() => setShowEndPicker(false)}
        />
      )}
    </>
  );
}

const makeStyles = () => StyleSheet.create({
  content: { paddingHorizontal: 20, gap: 14 },

  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 8 },
  backText: { fontSize: 13, color: COLORS.primary, fontWeight: '500' },

  badge: { fontSize: 9, color: COLORS.primary, letterSpacing: 4, textTransform: 'uppercase' },
  title: { fontSize: 30, fontWeight: '700', color: COLORS.text, letterSpacing: -0.5, marginTop: 4 },
  divider: { height: 1, backgroundColor: COLORS.border, marginTop: 12 },

  heroCard: {
    backgroundColor: COLORS.card, borderRadius: 20, padding: 20,
    borderWidth: 1, borderColor: COLORS.border, gap: 4,
  },
  heroLabel: { fontSize: 9, color: COLORS.muted, textTransform: 'uppercase', letterSpacing: 2, fontWeight: '600' },
  heroValue: { fontSize: 40, fontWeight: '700', color: COLORS.success, letterSpacing: -1.5 },
  heroSub: { fontSize: 11, color: COLORS.muted, marginTop: 2 },

  filterCard: {
    backgroundColor: COLORS.card, borderRadius: 14,
    borderWidth: 1, borderColor: COLORS.border, padding: 14, gap: 10,
  },
  filterLabel: { fontSize: 9, color: COLORS.muted, textTransform: 'uppercase', letterSpacing: 1.5, fontWeight: '600' },
  filterRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dateBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9,
  },
  dateBtnText: { fontSize: 12, color: COLORS.text, fontWeight: '500' },
  filterArrow: { fontSize: 14, color: COLORS.muted },

  summaryBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 4,
  },
  summaryCount: { fontSize: 11, color: COLORS.muted, fontWeight: '500' },
  summaryTotal: { fontSize: 15, color: COLORS.success, fontWeight: '700', letterSpacing: -0.3 },

  emptyCard: {
    backgroundColor: COLORS.card, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border,
    padding: 32, alignItems: 'center', gap: 10,
  },
  emptyText: { fontSize: 13, color: COLORS.muted },

  listCard: {
    backgroundColor: COLORS.card, borderRadius: 14,
    borderWidth: 1, borderColor: COLORS.border, padding: 14, gap: 0,
  },
  txRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingTop: 12, borderTopWidth: 1, borderTopColor: COLORS.border,
  },
  txIconWrap: {
    width: 32, height: 32, borderRadius: 10,
    backgroundColor: COLORS.successDim, alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  txInfo: { flex: 1, gap: 2 },
  txDesc: { fontSize: 13, fontWeight: '500', color: COLORS.text },
  txMeta: { fontSize: 10, color: COLORS.muted },
  txAmount: { fontSize: 13, fontWeight: '700', color: COLORS.success, letterSpacing: -0.3 },

  addBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: COLORS.primary, borderRadius: 12, paddingVertical: 15, marginTop: 4,
  },
  addBtnText: { fontSize: 13, fontWeight: '700', color: COLORS.background, textTransform: 'uppercase', letterSpacing: 1 },
});
