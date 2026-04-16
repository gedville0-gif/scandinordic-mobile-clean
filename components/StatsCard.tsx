import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS } from '@/constants/colors';

interface StatsCardProps {
  label: string;
  value: string;
  subLabel?: string;
  color?: string;
  icon?: React.ReactNode;
  compact?: boolean;
}

export function StatsCard({ label, value, subLabel, color = COLORS.primary, icon, compact }: StatsCardProps) {
  const styles = StyleSheet.create({
    card: {
      backgroundColor: COLORS.card,
      borderRadius: 16,
      padding: 16,
      borderWidth: 1,
      borderColor: COLORS.border,
      gap: 4,
    },
    compact: {
      padding: 12,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 4,
    },
    label: {
      fontSize: 11,
      fontFamily: 'Inter_500Medium',
      color: COLORS.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },
    value: {
      fontSize: 22,
      fontFamily: 'Inter_700Bold',
      color: COLORS.primary,
      letterSpacing: -0.5,
    },
    subLabel: {
      fontSize: 11,
      fontFamily: 'Inter_400Regular',
      color: COLORS.muted,
      marginTop: 2,
    },
    iconWrap: {
      width: 28,
      height: 28,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });

  return (
    <View style={[styles.card, compact && styles.compact]}>
      <View style={styles.header}>
        <Text style={styles.label}>{label}</Text>
        {icon && <View style={[styles.iconWrap, { backgroundColor: color + '20' }]}>{icon}</View>}
      </View>
      <Text style={[styles.value, { color }]}>{value}</Text>
      {subLabel ? <Text style={styles.subLabel}>{subLabel}</Text> : null}
    </View>
  );
}
