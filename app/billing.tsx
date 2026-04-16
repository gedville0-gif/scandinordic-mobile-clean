import React from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { COLORS } from '@/constants/colors';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAppDialog } from '@/components/AppDialog';

const PLANS = [
  {
    id: 'free',
    name: 'Free',
    price: '€0',
    period: '/mo',
    features: ['5 invoices / month', '50 transactions', 'Basic reports', '1 user'],
    current: false,
    accent: COLORS.muted,
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '€9.90',
    period: '/mo',
    features: [
      'Unlimited invoices + PDF',
      'Unlimited transactions',
      'All reports',
      'Mileage GPS tracking',
      'VAT management',
      'CSV import',
      'Receipt scanning',
    ],
    current: true,
    accent: COLORS.primary,
  },
  {
    id: 'business',
    name: 'Business',
    price: '€24.90',
    period: '/mo',
    features: [
      'Everything in Pro',
      'Team management',
      'Multi-user (up to 10)',
      'Priority support',
      'Custom branding',
      'API access',
    ],
    current: false,
    accent: COLORS.info,
  },
];

export default function BillingScreen() {
  const styles = makeStyles();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const { show: showDialog, dialog } = useAppDialog();

  const handleUpgrade = async (planName: string) => {
    await showDialog(
      'Stripe Integration',
      `Upgrading to ${planName} via Stripe is coming soon. You will be notified when it launches.`,
      [{ text: 'OK' }],
    );
  };

  return (
    <>
    <ScrollView
      style={{ flex: 1, backgroundColor: COLORS.background }}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 40 }]}
      showsVerticalScrollIndicator={false}
    >
      <Pressable style={styles.back} onPress={() => router.back()}>
        <Feather name="arrow-left" size={18} color={COLORS.primary} />
        <Text style={styles.backText}>{t('settings')}</Text>
      </Pressable>
      <Text style={styles.badge}>◆ ScandiNordic Pro ◆</Text>
      <Text style={styles.title}>{t('billing')}</Text>
      <View style={styles.divider} />

      {/* Current plan status */}
      <View style={styles.currentCard}>
        <View style={styles.currentTop}>
          <View>
            <Text style={styles.currentLabel}>{t('currentPlan')}</Text>
            <Text style={styles.currentPlanName}>PRO</Text>
          </View>
          <View style={styles.activeBadge}>
            <View style={styles.activeDot} />
            <Text style={styles.activeText}>Active</Text>
          </View>
        </View>
        <View style={styles.renewRow}>
          <Feather name="refresh-cw" size={11} color={COLORS.muted} />
          <Text style={styles.renewText}>Auto-renews monthly · Managed via Stripe</Text>
        </View>
      </View>

      {/* Plan cards */}
      <Text style={styles.sectionLabel}>{t('plan')}s</Text>
      {PLANS.map(plan => (
        <View
          key={plan.id}
          style={[
            styles.planCard,
            plan.current && { borderColor: COLORS.primary, borderWidth: 1.5 },
          ]}
        >
          {plan.current && (
            <View style={styles.currentBadge}>
              <Text style={styles.currentBadgeText}>{t('currentPlan').toUpperCase()}</Text>
            </View>
          )}
          <View style={styles.planTop}>
            <Text style={[styles.planName, { color: plan.current ? COLORS.primary : COLORS.text }]}>
              {plan.name}
            </Text>
            <View style={styles.priceRow}>
              <Text style={[styles.planPrice, { color: plan.accent }]}>{plan.price}</Text>
              <Text style={styles.planPeriod}>{plan.period}</Text>
            </View>
          </View>
          <View style={styles.featureList}>
            {plan.features.map(f => (
              <View key={f} style={styles.featureRow}>
                <Feather name="check" size={13} color={plan.accent} />
                <Text style={styles.featureText}>{f}</Text>
              </View>
            ))}
          </View>
          {!plan.current && (
            <Pressable
              style={[styles.upgradeBtn, { backgroundColor: plan.accent }]}
              onPress={() => handleUpgrade(plan.name)}
            >
              <Text style={styles.upgradeBtnText}>{t('upgrade')} to {plan.name}</Text>
            </Pressable>
          )}
        </View>
      ))}

      {/* Support */}
      <View style={styles.supportCard}>
        <Feather name="mail" size={18} color={COLORS.primary} />
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={styles.supportTitle}>Manage Subscription</Text>
          <Text style={styles.supportText}>
            To cancel or request a refund, contact our support team.
          </Text>
        </View>
        <Pressable
          onPress={() => showDialog('Support', 'Email: support@scandinordic.com', [{ text: 'OK' }])}
        >
          <Text style={styles.supportLink}>Contact →</Text>
        </Pressable>
      </View>

      <Text style={styles.version}>◆ ScandiNordic Pro v.2</Text>
    </ScrollView>
    {dialog}
    </>
  );
}

const makeStyles = () => StyleSheet.create({
  content: { paddingHorizontal: 20, gap: 14 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  backText: { fontSize: 14, color: COLORS.primary, fontWeight: '500' },
  badge: { fontSize: 9, color: COLORS.primary, letterSpacing: 4, textTransform: 'uppercase' },
  title: { fontSize: 24, fontWeight: '700', color: COLORS.text, letterSpacing: -0.5, marginTop: 4 },
  divider: { height: 1, backgroundColor: COLORS.border },

  currentCard: {
    backgroundColor: COLORS.card, borderRadius: 16,
    borderWidth: 1.5, borderColor: COLORS.primary + '50', padding: 16, gap: 10,
  },
  currentTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  currentLabel: { fontSize: 9, color: COLORS.muted, textTransform: 'uppercase', letterSpacing: 1.5, fontWeight: '600', marginBottom: 3 },
  currentPlanName: { fontSize: 22, fontWeight: '700', color: COLORS.primary, letterSpacing: 1 },
  activeBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: COLORS.successDim, paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 99, borderWidth: 1, borderColor: COLORS.success + '30',
  },
  activeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.success },
  activeText: { fontSize: 10, fontWeight: '600', color: COLORS.success },
  renewRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  renewText: { fontSize: 11, color: COLORS.muted },

  sectionLabel: { fontSize: 10, color: COLORS.muted, textTransform: 'uppercase', letterSpacing: 1.5, fontWeight: '600' },

  planCard: {
    backgroundColor: COLORS.card, borderRadius: 16,
    borderWidth: 1, borderColor: COLORS.border, padding: 16, gap: 12, overflow: 'hidden',
  },
  currentBadge: {
    position: 'absolute', top: 12, right: 12,
    backgroundColor: COLORS.primaryDim, borderRadius: 99,
    paddingHorizontal: 8, paddingVertical: 3,
    borderWidth: 1, borderColor: COLORS.primary + '40',
  },
  currentBadgeText: { fontSize: 8, fontWeight: '700', color: COLORS.primary, letterSpacing: 0.8 },
  planTop: { gap: 4 },
  planName: { fontSize: 18, fontWeight: '700', letterSpacing: -0.3 },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 3 },
  planPrice: { fontSize: 24, fontWeight: '700', letterSpacing: -0.5 },
  planPeriod: { fontSize: 12, color: COLORS.muted },
  featureList: { gap: 8 },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  featureText: { fontSize: 13, color: COLORS.textSecondary, flex: 1 },
  upgradeBtn: {
    borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginTop: 4,
  },
  upgradeBtnText: { fontSize: 13, fontWeight: '700', color: COLORS.background, textTransform: 'uppercase', letterSpacing: 0.8 },

  supportCard: {
    backgroundColor: COLORS.card, borderRadius: 14,
    borderWidth: 1, borderColor: COLORS.border, padding: 14,
    flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  supportTitle: { fontSize: 13, fontWeight: '600', color: COLORS.text },
  supportText: { fontSize: 11, color: COLORS.muted, lineHeight: 15 },
  supportLink: { fontSize: 12, fontWeight: '700', color: COLORS.primary },

  version: { textAlign: 'center', fontSize: 9, color: COLORS.muted + '60', letterSpacing: 4, marginTop: 8 },
});
