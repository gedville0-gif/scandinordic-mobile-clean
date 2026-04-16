import React from 'react';
import { ScrollView, Text, StyleSheet, View, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { COLORS } from '@/constants/colors';

interface Section {
  heading: string;
  body: string[];
}

interface Props {
  title: string;
  lastUpdated?: string;
  subtitle?: string;
  sections: Section[];
}

export default function LegalScreen({ title, lastUpdated, subtitle, sections }: Props) {
  const styles = makeStyles();
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: COLORS.background }}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 40 }]}
      showsVerticalScrollIndicator={false}
    >
      <Pressable style={styles.back} onPress={() => router.back()}>
        <Feather name="arrow-left" size={18} color={COLORS.primary} />
        <Text style={styles.backText}>Settings</Text>
      </Pressable>

      <Text style={styles.badge}>◆ ScandiNordic Pro ◆</Text>
      <Text style={styles.title}>{title}</Text>
      {lastUpdated ? <Text style={styles.meta}>Last Updated: {lastUpdated}</Text> : null}
      {subtitle ? <Text style={styles.meta}>{subtitle}</Text> : null}
      <View style={styles.divider} />

      {sections.map((section, i) => (
        <View key={i} style={styles.section}>
          <Text style={styles.heading}>{section.heading}</Text>
          {section.body.map((line, j) => (
            <Text key={j} style={styles.body}>{line}</Text>
          ))}
        </View>
      ))}

      <Text style={styles.version}>◆ ScandiNordic Pro v.2</Text>
    </ScrollView>
  );
}

const makeStyles = () => StyleSheet.create({
  content: { paddingHorizontal: 20, gap: 4 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  backText: { fontSize: 14, color: COLORS.primary, fontWeight: '500' },
  badge: { fontSize: 9, color: COLORS.primary, letterSpacing: 4, textTransform: 'uppercase' },
  title: { fontSize: 24, fontWeight: '700', color: COLORS.text, letterSpacing: -0.5, marginTop: 4 },
  meta: { fontSize: 11, color: COLORS.muted, marginTop: 4 },
  divider: { height: 1, backgroundColor: COLORS.border, marginTop: 12, marginBottom: 8 },
  section: { gap: 6, marginTop: 16 },
  heading: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  body: { fontSize: 13, color: COLORS.textSecondary, lineHeight: 20 },
  version: { textAlign: 'center', fontSize: 9, color: COLORS.muted + '60', letterSpacing: 4, marginTop: 32 },
});
