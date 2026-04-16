import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { COLORS } from '@/constants/colors';
import { formatCurrency } from '@/lib/currency';
import type { Transaction, Currency } from '@/lib/types';

interface TransactionItemProps {
  item: Transaction;
  currency: Currency;
  onPress?: (item: Transaction) => void;
  onDelete?: (id: string) => void;
}

const CATEGORY_ICONS: Record<string, string> = {
  Consulting: 'briefcase',
  Development: 'code',
  Writing: 'edit-2',
  Design: 'pen-tool',
  Software: 'monitor',
  Office: 'package',
  Travel: 'map-pin',
  Marketing: 'bar-chart-2',
  Other: 'circle',
};

export function TransactionItem({ item, currency, onPress, onDelete }: TransactionItemProps) {
  const isIncome = item.type === 'income';
  const color = isIncome ? COLORS.success : COLORS.danger;
  const icon = CATEGORY_ICONS[item.category] || 'circle';
  const date = new Date(item.date);
  const dateStr = date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });

  const styles = StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: 16,
      gap: 12,
      borderBottomWidth: 1,
      borderBottomColor: COLORS.border,
    },
    pressed: {
      backgroundColor: COLORS.cardElevated,
    },
    iconWrap: {
      width: 38,
      height: 38,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    info: {
      flex: 1,
      gap: 2,
    },
    description: {
      fontSize: 14,
      fontFamily: 'Inter_500Medium',
      color: COLORS.text,
    },
    meta: {
      fontSize: 11,
      fontFamily: 'Inter_400Regular',
      color: COLORS.muted,
    },
    right: {
      alignItems: 'flex-end',
      gap: 2,
    },
    amount: {
      fontSize: 14,
      fontFamily: 'Inter_700Bold',
      letterSpacing: -0.3,
    },
    vat: {
      fontSize: 10,
      fontFamily: 'Inter_400Regular',
      color: COLORS.muted,
    },
  });

  const handlePress = () => {
    Haptics.selectionAsync();
    onPress?.(item);
  };

  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      onPress={handlePress}
    >
      <View style={[styles.iconWrap, { backgroundColor: color + '18' }]}>
        <Feather name={icon as any} size={16} color={color} />
      </View>
      <View style={styles.info}>
        <Text style={styles.description} numberOfLines={1}>{item.description}</Text>
        <Text style={styles.meta}>{item.category} · {dateStr}</Text>
      </View>
      <View style={styles.right}>
        <Text style={[styles.amount, { color }]}>
          {isIncome ? '+' : '-'}{formatCurrency(item.amount, currency)}
        </Text>
        {item.vatRate ? (
          <Text style={styles.vat}>VAT {item.vatRate}%</Text>
        ) : null}
      </View>
    </Pressable>
  );
}
