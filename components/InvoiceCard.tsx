import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { COLORS } from '@/constants/colors';
import { formatCents } from '@/lib/money';
import { useLanguage } from '@/contexts/LanguageContext';
import type { Invoice, Currency } from '@/lib/types';

interface InvoiceCardProps {
  invoice: Invoice;
  currency: Currency;
  onPress?: (inv: Invoice) => void;
  onPdfPress?: (inv: Invoice) => void;
  onDownloadPress?: (inv: Invoice) => void;
}

export function InvoiceCard({ invoice, currency, onPress, onPdfPress, onDownloadPress }: InvoiceCardProps) {
  const { t } = useLanguage();

  const STATUS_COLORS: Record<Invoice['status'], string> = {
    draft: COLORS.muted,
    sent: COLORS.info,
    paid: COLORS.success,
    overdue: COLORS.danger,
  };

  const STATUS_BG: Record<Invoice['status'], string> = {
    draft: COLORS.border,
    sent: COLORS.infoDim,
    paid: COLORS.successDim,
    overdue: COLORS.dangerDim,
  };

  const styles = StyleSheet.create({
    card: {
      backgroundColor: COLORS.card,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: COLORS.border,
      overflow: 'hidden',
      marginHorizontal: 16,
      marginBottom: 10,
    },
    pressed: {
      backgroundColor: COLORS.cardElevated,
    },
    top: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      padding: 14,
    },
    left: {
      gap: 2,
      flex: 1,
      marginRight: 10,
    },
    number: {
      fontSize: 12,
      fontFamily: 'Inter_500Medium',
      color: COLORS.primary,
      letterSpacing: 0.5,
    },
    client: {
      fontSize: 15,
      fontFamily: 'Inter_600SemiBold',
      color: COLORS.text,
    },
    badge: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 20,
    },
    badgeText: {
      fontSize: 11,
      fontFamily: 'Inter_600SemiBold',
      letterSpacing: 0.3,
    },
    divider: {
      height: 1,
      backgroundColor: COLORS.border,
      marginHorizontal: 14,
    },
    bottom: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: 14,
      gap: 10,
    },
    metaLabel: {
      fontSize: 10,
      fontFamily: 'Inter_400Regular',
      color: COLORS.muted,
      marginBottom: 2,
    },
    metaValue: {
      fontSize: 13,
      fontFamily: 'Inter_500Medium',
      color: COLORS.text,
    },
    amounts: {
      flex: 1,
      alignItems: 'flex-end',
    },
    totalAmount: {
      fontSize: 18,
      fontFamily: 'Inter_700Bold',
      color: COLORS.primary,
      letterSpacing: -0.5,
    },
    actionBtns: {
      flexDirection: 'row',
      gap: 6,
    },
    pdfBtn: {
      width: 34,
      height: 34,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: COLORS.primaryDim,
      borderWidth: 1,
      borderColor: COLORS.primary + '40',
    },
  });

  const statusColor = STATUS_COLORS[invoice.status];
  const statusBg = STATUS_BG[invoice.status];
  const dueDate = new Date(invoice.dueDate);
  const dueDateStr = dueDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const isOverdue = invoice.status === 'overdue';

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      onPress={() => { Haptics.selectionAsync(); onPress?.(invoice); }}
    >
      <View style={styles.top}>
        <View style={styles.left}>
          <Text style={styles.number}>{invoice.invoiceNumber}</Text>
          <Text style={styles.client} numberOfLines={1}>{invoice.clientName}</Text>
        </View>
        <View style={[styles.badge, { backgroundColor: statusBg }]}>
          <Text style={[styles.badgeText, { color: statusColor }]}>
            {invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)}
          </Text>
        </View>
      </View>
      <View style={styles.divider} />
      <View style={styles.bottom}>
        <View>
          <Text style={styles.metaLabel}>{t('due')}</Text>
          <Text style={[styles.metaValue, isOverdue && { color: COLORS.danger }]}>{dueDateStr}</Text>
        </View>
        <View style={styles.amounts}>
          <Text style={styles.metaLabel}>{t('totalInclVat')}</Text>
          <Text style={styles.totalAmount}>{formatCents(invoice.totalAmountCents, currency)}</Text>
        </View>
        <View style={styles.actionBtns}>
          {onPdfPress && (
            <Pressable
              onPress={() => { Haptics.selectionAsync(); onPdfPress(invoice); }}
              style={styles.pdfBtn}
              hitSlop={8}
            >
              <Feather name="share" size={16} color={COLORS.primary} />
            </Pressable>
          )}
          <Pressable
            onPress={() => { Haptics.selectionAsync(); onDownloadPress?.(invoice); }}
            style={styles.pdfBtn}
            hitSlop={8}
          >
            <Feather name="download" size={16} color={COLORS.primary} />
          </Pressable>
        </View>
      </View>
    </Pressable>
  );
}
