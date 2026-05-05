import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { COLORS } from '@/constants/colors';
import {
  INTEGRATIONS, CATEGORY_LABELS, getConnectedIds, connectIntegration, disconnectIntegration,
  type IntegrationDef,
} from '@/lib/integrations';
import { useAppDialog } from '@/components/AppDialog';

const CATEGORIES: IntegrationDef['category'][] = ['banking', 'payments', 'accounting'];

export default function IntegrationsScreen() {
  const s = makeStyles();
  const insets = useSafeAreaInsets();
  const { show: showDialog, dialog } = useAppDialog();
  const [connectedIds, setConnectedIds] = useState<string[]>([]);

  const load = useCallback(async () => {
    setConnectedIds(await getConnectedIds());
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleConnect = async (int: IntegrationDef) => {
    if (!int.available) {
      await showDialog(
        'Coming Soon',
        `${int.name} integration is coming soon. We'll notify you when it's available.`,
        [{ text: 'OK', style: 'cancel' }],
      );
      return;
    }
    await connectIntegration(int.id);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await load();
  };

  const handleDisconnect = async (int: IntegrationDef) => {
    const idx = await showDialog(
      `Disconnect ${int.name}`,
      'This will stop syncing data from this integration.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Disconnect', style: 'destructive' },
      ],
    );
    if (idx === 1) {
      await disconnectIntegration(int.id);
      Haptics.selectionAsync();
      await load();
    }
  };

  const connectedCount = connectedIds.length;

  return (
    <>
      <ScrollView
        style={{ flex: 1, backgroundColor: COLORS.background }}
        contentContainerStyle={[s.content, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <Text style={s.badge}>◆ ScandiNordic Pro ◆</Text>
        <View style={s.titleRow}>
          <Pressable
            style={({ pressed }) => [s.backBtn, pressed && { opacity: 0.65 }]}
            onPress={() => router.back()}
          >
            <Feather name="arrow-left" size={18} color={COLORS.text} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={s.title}>Integrations</Text>
            <Text style={s.subtitle}>Connect your tools and bank accounts</Text>
          </View>
          {connectedCount > 0 && (
            <View style={s.countBadge}>
              <Text style={s.countBadgeText}>{connectedCount} connected</Text>
            </View>
          )}
        </View>
        <View style={s.divider} />

        {CATEGORIES.map(cat => {
          const items = INTEGRATIONS.filter(i => i.category === cat);
          return (
            <View key={cat}>
              <Text style={s.catLabel}>{CATEGORY_LABELS[cat].toUpperCase()}</Text>
              {items.map(int => {
                const isConnected = connectedIds.includes(int.id);
                return (
                  <View
                    key={int.id}
                    style={[s.intCard, isConnected && { borderColor: COLORS.success + '40' }]}
                  >
                    <Text style={s.intIcon}>{int.icon}</Text>
                    <View style={{ flex: 1 }}>
                      <View style={s.intNameRow}>
                        <Text style={s.intName}>{int.name}</Text>
                        {isConnected && (
                          <View style={s.liveBadge}>
                            <View style={s.liveDot} />
                            <Text style={s.liveBadgeText}>LIVE</Text>
                          </View>
                        )}
                        {!int.available && !isConnected && (
                          <View style={s.soonBadge}>
                            <Text style={s.soonBadgeText}>SOON</Text>
                          </View>
                        )}
                      </View>
                      <Text style={s.intDesc}>{int.description}</Text>
                    </View>
                    {isConnected ? (
                      <Pressable
                        style={({ pressed }) => [s.disconnectBtn, pressed && { opacity: 0.65 }]}
                        onPress={() => handleDisconnect(int)}
                      >
                        <Text style={s.disconnectBtnText}>Disconnect</Text>
                      </Pressable>
                    ) : (
                      <Pressable
                        style={({ pressed }) => [
                          s.connectBtn,
                          !int.available && s.connectBtnSoon,
                          pressed && { opacity: 0.65 },
                        ]}
                        onPress={() => handleConnect(int)}
                      >
                        <Text style={[s.connectBtnText, !int.available && s.connectBtnTextSoon]}>
                          {int.available ? 'Connect' : 'Notify me'}
                        </Text>
                      </Pressable>
                    )}
                  </View>
                );
              })}
            </View>
          );
        })}

        {/* Coming soon footer */}
        <View style={s.moreCard}>
          <Text style={s.moreIcon}>🚀</Text>
          <Text style={s.moreTitle}>More integrations coming</Text>
          <Text style={s.moreHint}>Request an integration via Settings → Feedback</Text>
        </View>

        <Text style={s.footer}>◆ ScandiNordic Pro ◆</Text>
      </ScrollView>
      {dialog}
    </>
  );
}

const makeStyles = () => StyleSheet.create({
  content: { paddingHorizontal: 20, gap: 12 },

  badge:    { fontSize: 9, color: COLORS.primary, letterSpacing: 4, textTransform: 'uppercase' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  backBtn:  {
    width: 34, height: 34, borderRadius: 17, backgroundColor: COLORS.surface,
    borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center',
  },
  title:    { fontSize: 22, fontWeight: '700', color: COLORS.text, letterSpacing: -0.5 },
  subtitle: { fontSize: 11, color: COLORS.muted, marginTop: 1 },
  countBadge: {
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99,
    borderWidth: 1, borderColor: COLORS.primary + '50', backgroundColor: COLORS.primary + '15',
  },
  countBadgeText: { fontSize: 10, color: COLORS.primary, fontWeight: '600' },
  divider: { height: 1, backgroundColor: COLORS.border },

  catLabel: { fontSize: 9, color: COLORS.muted, letterSpacing: 2, fontWeight: '600', marginBottom: 6, marginTop: 4 },

  intCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: COLORS.card, borderRadius: 14,
    borderWidth: 1, borderColor: COLORS.border, padding: 14, marginBottom: 6,
  },
  intIcon: { fontSize: 24 },
  intNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  intName: { fontSize: 13, fontWeight: '600', color: COLORS.text },
  intDesc: { fontSize: 10, color: COLORS.muted, marginTop: 2 },

  liveBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 99,
    borderWidth: 1, borderColor: COLORS.success + '40', backgroundColor: COLORS.success + '18',
  },
  liveDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: COLORS.success },
  liveBadgeText: { fontSize: 8, fontWeight: '700', color: COLORS.success },

  soonBadge: {
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 99,
    borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface,
  },
  soonBadgeText: { fontSize: 8, fontWeight: '600', color: COLORS.muted },

  connectBtn: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8,
    backgroundColor: COLORS.primary, minWidth: 76, alignItems: 'center',
  },
  connectBtnSoon: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  connectBtnText: { fontSize: 11, fontWeight: '700', color: COLORS.background },
  connectBtnTextSoon: { color: COLORS.muted },

  disconnectBtn: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8,
    borderWidth: 1, borderColor: COLORS.danger + '40', backgroundColor: COLORS.danger + '15',
    minWidth: 88, alignItems: 'center',
  },
  disconnectBtnText: { fontSize: 11, fontWeight: '600', color: COLORS.danger },

  moreCard: {
    backgroundColor: COLORS.card, borderRadius: 14,
    borderWidth: 1, borderColor: COLORS.border, padding: 20, alignItems: 'center',
    marginTop: 4,
  },
  moreIcon:  { fontSize: 28, marginBottom: 6 },
  moreTitle: { fontSize: 13, fontWeight: '600', color: COLORS.text },
  moreHint:  { fontSize: 10, color: COLORS.muted, marginTop: 4, textAlign: 'center' },

  footer: { textAlign: 'center', fontSize: 9, color: COLORS.muted + '60', letterSpacing: 4, marginTop: 8 },
});
