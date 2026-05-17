import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  Modal, View, Text, StyleSheet, TouchableOpacity,
  FlatList, ScrollView,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '@/constants/colors';
import { INCOME_CATEGORIES, EXPENSE_CATEGORIES } from '@/constants/categories';
import { formatCents, absCents } from '@/lib/money';
import type { Transaction, Currency } from '@/lib/types';
import { useLanguage } from '@/contexts/LanguageContext';

const VAT_OPTIONS: Array<{ label: string; value: number | undefined }> = [
  { label: 'Exempt', value: undefined },
  { label: '0%', value: 0 },
  { label: '10%', value: 10 },
  { label: '13.5%', value: 13.5 },
  { label: '25.5%', value: 25.5 },
];

const FOOD_MERCHANTS = ['k-market', 'alepa', 'prisma', 's-market', 'lidl', 'k-supermarket', 'k-citymarket'];

function autoVatRate(tx: Transaction): number | undefined {
  if (tx.type === 'income') return undefined;
  const lower = tx.description.toLowerCase();
  if (FOOD_MERCHANTS.some(m => lower.includes(m))) return 13.5;
  return 25.5;
}

const ALL_CATEGORIES = [...INCOME_CATEGORIES, ...EXPENSE_CATEGORIES];

interface Props {
  visible: boolean;
  transactions: Transaction[];
  onConfirm: (transactions: Transaction[]) => void;
  onCancel: () => void;
  currency: Currency;
}

export function PDFReviewModal({ visible, transactions: initial, onConfirm, onCancel, currency }: Props) {
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setTxs(initial.map(tx => ({ ...tx, vatRate: autoVatRate(tx) })));
      setExpandedId(null);
    }
  }, [visible]);

  const setVat = useCallback((id: string, value: number | undefined) => {
    setTxs(prev => prev.map(tx => tx.id === id ? { ...tx, vatRate: value } : tx));
  }, []);

  const setCategory = useCallback((id: string, category: string) => {
    setTxs(prev => prev.map(tx => tx.id === id ? { ...tx, category } : tx));
    setExpandedId(null);
  }, []);

  const bulkSetVat = useCallback((value: number | undefined) => {
    setTxs(prev => prev.map(tx => ({ ...tx, vatRate: value })));
  }, []);

  const incomeCount = txs.filter(tx => tx.type === 'income').length;
  const expenseCount = txs.filter(tx => tx.type === 'expense').length;

  const renderItem = useCallback(({ item }: { item: Transaction }) => {
    const isIncome = item.type === 'income';
    const color = isIncome ? COLORS.success : COLORS.danger;
    const date = new Date(item.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
    const cats = isIncome ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
    const catLabel = ALL_CATEGORIES.find(c => c.id === item.category)?.label ?? item.category;
    const isExpanded = expandedId === item.id;
    const vatLabel = item.vatRate == null ? 'Exempt' : `${item.vatRate}%`;

    return (
      <View style={styles.row}>
        <View style={styles.rowMain}>
          <View style={[styles.typeDot, { backgroundColor: color + '22' }]}>
            <Text style={[styles.typeArrow, { color }]}>{isIncome ? '↑' : '↓'}</Text>
          </View>
          <View style={styles.rowInfo}>
            <Text style={styles.rowDesc} numberOfLines={1}>{item.description}</Text>
            <TouchableOpacity onPress={() => setExpandedId(isExpanded ? null : item.id)}>
              <Text style={styles.rowCat}>{catLabel} ▾</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.rowRight}>
            <Text style={[styles.rowAmount, { color }]}>
              {isIncome ? '+' : '-'}{formatCents(absCents(item.amountCents), currency)}
            </Text>
            <Text style={styles.rowDate}>{date}</Text>
          </View>
        </View>

        {isExpanded && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catScroll} contentContainerStyle={styles.catScrollContent}>
            {cats.map(c => (
              <TouchableOpacity
                key={c.id}
                style={[styles.catChip, item.category === c.id && styles.catChipActive]}
                onPress={() => setCategory(item.id, c.id)}
              >
                <Text style={[styles.catChipText, item.category === c.id && styles.catChipTextActive]}>
                  {c.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        <View style={styles.vatRow}>
          {VAT_OPTIONS.map(opt => {
            const isActive = item.vatRate === opt.value;
            return (
              <TouchableOpacity
                key={String(opt.value)}
                style={[styles.vatChip, isActive && styles.vatChipActive]}
                onPress={() => setVat(item.id, opt.value)}
              >
                <Text style={[styles.vatChipText, isActive && styles.vatChipTextActive]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    );
  }, [expandedId, currency, setVat, setCategory]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.badge}>◆ SCANDINORDIC PRO ◆</Text>
            <Text style={styles.title}>{t('reviewImport')}</Text>
            <Text style={styles.subtitle}>{incomeCount} income · {expenseCount} expense</Text>
          </View>
          <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}>
            <Feather name="x" size={20} color={COLORS.text} />
          </TouchableOpacity>
        </View>

        <View style={styles.divider} />

        <View style={styles.bulkRow}>
          <Text style={styles.bulkLabel}>{t('bulkSetVat')}:</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.bulkChips}>
            {VAT_OPTIONS.map(opt => (
              <TouchableOpacity
                key={String(opt.value)}
                style={styles.bulkChip}
                onPress={() => bulkSetVat(opt.value)}
              >
                <Text style={styles.bulkChipText}>{opt.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        <View style={styles.divider} />

        <FlatList
          data={txs}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}
          initialNumToRender={20}
          windowSize={10}
        />

        <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
          <TouchableOpacity style={styles.importBtn} onPress={() => onConfirm(txs)}>
            <Feather name="download" size={16} color={COLORS.background} />
            <Text style={styles.importBtnText}>{t('importAll')} ({txs.length})</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  headerLeft: { flex: 1 },
  badge: { fontSize: 8, color: COLORS.primary, letterSpacing: 4, textTransform: 'uppercase', marginBottom: 4 },
  title: { fontSize: 22, fontWeight: '700', color: COLORS.text, letterSpacing: -0.5 },
  subtitle: { fontSize: 12, color: COLORS.muted, marginTop: 2 },
  cancelBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border,
    alignItems: 'center', justifyContent: 'center', marginLeft: 12,
  },
  divider: { height: 1, backgroundColor: COLORS.border, marginHorizontal: 0 },
  bulkRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 10, gap: 8,
  },
  bulkLabel: { fontSize: 10, color: COLORS.muted, textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: '600', flexShrink: 0 },
  bulkChips: { flexDirection: 'row', gap: 6 },
  bulkChip: {
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 99,
    borderWidth: 1, borderColor: COLORS.primary + '60',
    backgroundColor: COLORS.primaryDim,
  },
  bulkChipText: { fontSize: 10, color: COLORS.primary, fontWeight: '600' },
  separator: { height: 1, backgroundColor: COLORS.border + '60' },
  row: {
    paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: COLORS.background,
  },
  rowMain: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  typeDot: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  typeArrow: { fontSize: 13, fontWeight: '700' },
  rowInfo: { flex: 1, gap: 2 },
  rowDesc: { fontSize: 13, fontWeight: '500', color: COLORS.text },
  rowCat: { fontSize: 10, color: COLORS.primary, fontWeight: '500' },
  rowRight: { alignItems: 'flex-end', gap: 2 },
  rowAmount: { fontSize: 12, fontWeight: '700', letterSpacing: -0.3 },
  rowDate: { fontSize: 9, color: COLORS.muted },
  catScroll: { marginBottom: 8 },
  catScrollContent: { flexDirection: 'row', gap: 6 },
  catChip: {
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 99,
    borderWidth: 1, borderColor: COLORS.border,
  },
  catChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  catChipText: { fontSize: 10, color: COLORS.muted },
  catChipTextActive: { color: COLORS.background, fontWeight: '600' },
  vatRow: { flexDirection: 'row', gap: 5, flexWrap: 'wrap' },
  vatChip: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 99,
    borderWidth: 1, borderColor: COLORS.border,
  },
  vatChipActive: { backgroundColor: COLORS.card, borderColor: COLORS.primary },
  vatChipText: { fontSize: 10, color: COLORS.muted },
  vatChipTextActive: { color: COLORS.primary, fontWeight: '700' },
  footer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: COLORS.background,
    borderTopWidth: 1, borderTopColor: COLORS.border,
    paddingHorizontal: 16, paddingTop: 12,
  },
  importBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 14, paddingVertical: 14,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  importBtnText: { fontSize: 14, fontWeight: '700', color: COLORS.background, letterSpacing: 0.3 },
});
