import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, Switch,
  useWindowDimensions, StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Colors } from '../../constants/colors';
import { saveOnboardingProfile } from '../../lib/storage';
import { useTheme } from '../../contexts/ThemeContext';
import {
  PROFESSIONS, FEATURES, PROFESSION_FEATURES, CATEGORY_LABELS, FEATURE_ORDER,
  type ProfessionId, type FeatureId, type FeatureMap, type ProfessionCategory,
} from '@/lib/professions';

const CATEGORIES: ProfessionCategory[] = ['services', 'products', 'team', 'creative'];

export default function ProfessionOnboarding() {
  const { mode } = useTheme();
  const C = Colors[mode] ?? Colors.dark;
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [selectedProfession, setSelectedProfession] = useState<ProfessionId | null>(null);
  const [featureMap, setFeatureMap] = useState<FeatureMap | null>(null);

  const profession = PROFESSIONS.find(p => p.id === selectedProfession);

  function handleSelectProfession(id: ProfessionId) {
    setSelectedProfession(id);
  }

  function handleContinueToFeatures() {
    if (!selectedProfession) return;
    setFeatureMap({ ...PROFESSION_FEATURES[selectedProfession] });
    setStep(2);
  }

  function handleContinueToConfirm() {
    setStep(3);
  }

  function handleToggle(id: FeatureId) {
    if (!featureMap) return;
    const cur = featureMap[id];
    if (cur === 'key') return; // key features can't be toggled off
    setFeatureMap(prev => prev ? { ...prev, [id]: cur === 'hidden' ? 'enabled' : 'hidden' } : prev);
  }

  async function handleFinish() {
    if (!selectedProfession || !featureMap) return;
    await saveOnboardingProfile({
      profession: selectedProfession,
      features: featureMap,
      onboarding_completed: true,
      completed_at: new Date().toISOString(),
    });
    router.replace('/(tabs)');
  }

  function handleSkip() {
    const prof: ProfessionId = 'other';
    const map = { ...PROFESSION_FEATURES[prof] };
    setSelectedProfession(prof);
    setFeatureMap(map);
    setStep(2);
  }

  const s = makeStyles(C, mode);

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar barStyle={mode === 'dark' ? 'light-content' : 'dark-content'} />

      {/* Header */}
      <View style={s.header}>
        <View style={s.stepDots}>
          {[1, 2, 3].map(n => (
            <View
              key={n}
              style={[
                s.dot,
                n < step && s.dotDone,
                n === step && s.dotActive,
              ]}
            />
          ))}
        </View>
        <Text style={s.logoText}>
          Scandi<Text style={{ color: C.gold }}>Nordic</Text> Pro
        </Text>
        <Text style={s.stepLabel}>
          Step {step} of 3 · {step === 1 ? 'Profession' : step === 2 ? 'Your Features' : 'Confirm Setup'}
        </Text>
      </View>

      {/* Content */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}
        showsVerticalScrollIndicator={false}
      >
        {step === 1 && (
          <Step1
            C={C}
            s={s}
            selected={selectedProfession}
            onSelect={handleSelectProfession}
          />
        )}
        {step === 2 && profession && featureMap && (
          <Step2 C={C} s={s} profession={profession} featureMap={featureMap} />
        )}
        {step === 3 && profession && featureMap && (
          <Step3 C={C} s={s} profession={profession} featureMap={featureMap} onToggle={handleToggle} />
        )}
      </ScrollView>

      {/* CTA */}
      <View style={[s.ctaWrap, { paddingBottom: insets.bottom + 16 }]}>
        {step === 1 && (
          <>
            <Pressable
              style={[s.ctaBtn, !selectedProfession && s.ctaBtnDisabled]}
              onPress={handleContinueToFeatures}
              disabled={!selectedProfession}
            >
              <Text style={s.ctaBtnText}>
                {selectedProfession ? `Continue with ${profession?.name} →` : 'Select a profession'}
              </Text>
            </Pressable>
            <Pressable style={s.ctaSkip} onPress={handleSkip}>
              <Text style={s.ctaSkipText}>Skip · I'll set up later</Text>
            </Pressable>
          </>
        )}
        {step === 2 && (
          <Pressable style={s.ctaBtn} onPress={handleContinueToConfirm}>
            <Text style={s.ctaBtnText}>Looks great! →</Text>
          </Pressable>
        )}
        {step === 3 && (
          <Pressable style={s.ctaBtn} onPress={handleFinish}>
            <Text style={s.ctaBtnText}>Finish Setup →</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

/* ─── Step 1 ─── */
function Step1({ C, s, selected, onSelect }: {
  C: typeof Colors.dark;
  s: ReturnType<typeof makeStyles>;
  selected: ProfessionId | null;
  onSelect: (id: ProfessionId) => void;
}) {
  return (
    <View>
      <Text style={s.stepTitle}>What do you do?</Text>
      <Text style={s.stepSub}>We'll set up the right features for you</Text>
      {CATEGORIES.map(cat => {
        const profs = PROFESSIONS.filter(p => p.category === cat);
        return (
          <View key={cat}>
            <Text style={s.catLabel}>{CATEGORY_LABELS[cat]}</Text>
            <View style={s.profGrid}>
              {profs.map(p => {
                const isSel = selected === p.id;
                return (
                  <Pressable
                    key={p.id}
                    style={[s.profCard, isSel && { borderColor: `${C.gold}80`, backgroundColor: `${C.gold}14` }]}
                    onPress={() => onSelect(p.id)}
                  >
                    {isSel && (
                      <View style={s.profCheckBadge}>
                        <Text style={{ color: C.background, fontSize: 8, fontWeight: '700' }}>✓</Text>
                      </View>
                    )}
                    <Text style={s.profIcon}>{p.icon}</Text>
                    <Text style={[s.profName, { color: C.text }]}>{p.name}</Text>
                    <Text style={[s.profDesc, { color: C.muted }]}>{p.description}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        );
      })}
    </View>
  );
}

/* ─── Step 2 ─── */
function Step2({ C, s, profession, featureMap }: {
  C: typeof Colors.dark;
  s: ReturnType<typeof makeStyles>;
  profession: (typeof PROFESSIONS)[number];
  featureMap: FeatureMap;
}) {
  const active = FEATURE_ORDER.filter(id => featureMap[id] === 'key' || featureMap[id] === 'enabled');
  const hidden = FEATURE_ORDER.filter(id => featureMap[id] === 'hidden');

  return (
    <View>
      <Text style={s.stepTitle}>{profession.tagline}</Text>
      <View style={s.profBadge}>
        <Text style={[s.profBadgeText, { color: C.gold }]}>{profession.icon} {profession.name}</Text>
      </View>

      <Text style={s.sectionTitle}>★ Key features for you</Text>
      <View style={[s.featCard, { borderColor: C.border }]}>
        {active.map((id, i) => {
          const feat = FEATURES.find(f => f.id === id)!;
          const isKey = featureMap[id] === 'key';
          return (
            <View key={id} style={[s.featRow, i < active.length - 1 && { borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)' }]}>
              <Text style={s.featEmoji}>{feat.emoji}</Text>
              <Text style={[s.featName, { color: C.text, flex: 1 }]}>{feat.name}</Text>
              <View style={[s.featTag, isKey ? s.featTagKey : s.featTagOn]}>
                <Text style={[s.featTagText, { color: isKey ? C.gold : C.green }]}>{isKey ? '★ Key' : '✓ On'}</Text>
              </View>
            </View>
          );
        })}
      </View>

      {hidden.length > 0 && (
        <View>
          <Text style={[s.sectionTitle, { color: C.muted, opacity: 0.7 }]}>Hidden (not needed)</Text>
          <View style={[s.featCard, { borderColor: 'rgba(255,255,255,0.06)', opacity: 0.4 }]}>
            {hidden.map((id, i) => {
              const feat = FEATURES.find(f => f.id === id)!;
              return (
                <View key={id} style={[s.featRow, i < hidden.length - 1 && { borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)' }]}>
                  <Text style={s.featEmoji}>{feat.emoji}</Text>
                  <Text style={[s.featName, { color: C.text, flex: 1 }]}>{feat.name}</Text>
                  <View style={s.featTagHidden}>
                    <Text style={[s.featTagText, { color: C.muted }]}>Hidden</Text>
                  </View>
                </View>
              );
            })}
          </View>
          <Text style={[s.featHint, { color: C.muted }]}>Enable anytime in Settings →</Text>
        </View>
      )}
    </View>
  );
}

/* ─── Step 3 ─── */
function Step3({ C, s, profession, featureMap, onToggle }: {
  C: typeof Colors.dark;
  s: ReturnType<typeof makeStyles>;
  profession: (typeof PROFESSIONS)[number];
  featureMap: FeatureMap;
  onToggle: (id: FeatureId) => void;
}) {
  return (
    <View>
      <Text style={s.stepTitle}>Confirm your setup</Text>
      <Text style={s.stepSub}>Review and adjust — change anytime in Settings.</Text>
      <View style={s.profBadge}>
        <Text style={[s.profBadgeText, { color: C.gold }]}>{profession.icon} {profession.name}</Text>
      </View>

      <Text style={s.sectionTitle}>Features</Text>
      <View style={[s.featCard, { borderColor: C.border }]}>
        {FEATURE_ORDER.map((id, i) => {
          const feat = FEATURES.find(f => f.id === id)!;
          const status = featureMap[id];
          const isOn = status === 'key' || status === 'enabled';
          const isKey = status === 'key';
          return (
            <View
              key={id}
              style={[
                s.featRowToggle,
                i < FEATURE_ORDER.length - 1 && { borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)' },
                !isOn && { opacity: 0.38 },
              ]}
            >
              <Text style={s.featEmoji}>{feat.emoji}</Text>
              <View style={{ flex: 1 }}>
                <Text style={[s.featName, { color: C.text }]}>{feat.name}</Text>
                <Text style={[s.featDesc, { color: C.muted }]}>{feat.description}</Text>
              </View>
              {isKey ? (
                <View style={s.featTagKey}>
                  <Text style={[s.featTagText, { color: C.gold }]}>★ Key</Text>
                </View>
              ) : (
                <Switch
                  value={isOn}
                  onValueChange={() => onToggle(id)}
                  trackColor={{ false: 'rgba(255,255,255,0.12)', true: C.gold }}
                  thumbColor={C.background}
                  ios_backgroundColor="rgba(255,255,255,0.12)"
                  style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }}
                />
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}

/* ─── Styles ─── */
function makeStyles(C: typeof Colors.dark, mode: 'dark' | 'light') {
  const bg = mode === 'dark' ? '#0e0a07' : '#F7F1E7';
  const cardBg = mode === 'dark' ? 'rgba(20,16,12,1)' : '#FFFDF9';

  return StyleSheet.create({
    root:       { flex: 1, backgroundColor: bg },
    header:     { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4 },
    stepDots:   { flexDirection: 'row', gap: 4, marginBottom: 10 },
    dot:        { flex: 1, height: 3, borderRadius: 99, backgroundColor: 'rgba(255,255,255,0.08)' },
    dotDone:    { backgroundColor: C.gold },
    dotActive:  { backgroundColor: `${C.gold}55` },
    logoText:   { fontFamily: 'Inter_600SemiBold', fontSize: 18, color: C.text, textAlign: 'center' },
    stepLabel:  { fontSize: 9, letterSpacing: 2, textTransform: 'uppercase', color: C.muted, textAlign: 'center', marginTop: 2, fontFamily: 'Inter_400Regular' },

    stepTitle:  { fontFamily: 'Inter_700Bold', fontSize: 22, color: C.text, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 2, lineHeight: 28 },
    stepSub:    { fontSize: 11, color: C.muted, paddingHorizontal: 20, paddingBottom: 10, fontFamily: 'Inter_400Regular' },
    catLabel:   { fontSize: 9, letterSpacing: 2.5, textTransform: 'uppercase', color: C.gold, fontFamily: 'Inter_600SemiBold', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 6 },
    profGrid:   { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, gap: 6 },
    profCard: {
      width: '30.5%', borderRadius: 12, padding: 10, alignItems: 'center',
      borderWidth: 1, borderColor: `${C.gold}20`, backgroundColor: cardBg,
      position: 'relative',
    },
    profCheckBadge: {
      position: 'absolute', top: 5, right: 5, width: 14, height: 14,
      backgroundColor: C.gold, borderRadius: 7,
      alignItems: 'center', justifyContent: 'center',
    },
    profIcon:   { fontSize: 22, marginBottom: 5 },
    profName:   { fontSize: 10, fontFamily: 'Inter_600SemiBold', textAlign: 'center', lineHeight: 13 },
    profDesc:   { fontSize: 9, textAlign: 'center', marginTop: 2, lineHeight: 12, fontFamily: 'Inter_400Regular' },

    profBadge:  { marginHorizontal: 20, marginBottom: 12, alignSelf: 'flex-start', backgroundColor: `${C.gold}18`, borderWidth: 1, borderColor: `${C.gold}40`, borderRadius: 99, paddingHorizontal: 12, paddingVertical: 4 },
    profBadgeText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
    sectionTitle: { fontSize: 9, letterSpacing: 2, textTransform: 'uppercase', color: C.gold, fontFamily: 'Inter_600SemiBold', paddingHorizontal: 20, paddingBottom: 6, paddingTop: 4 },

    featCard:   { marginHorizontal: 16, borderRadius: 12, borderWidth: 1, backgroundColor: cardBg, overflow: 'hidden', marginBottom: 10 },
    featRow:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, gap: 10 },
    featRowToggle: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, gap: 10 },
    featEmoji:  { fontSize: 15, width: 22, textAlign: 'center' },
    featName:   { fontSize: 11, fontFamily: 'Inter_500Medium' },
    featDesc:   { fontSize: 9, fontFamily: 'Inter_400Regular', marginTop: 1 },
    featTag:    { borderRadius: 99, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1 },
    featTagKey: { backgroundColor: `${C.gold}18`, borderColor: `${C.gold}40`, borderRadius: 99, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1 },
    featTagOn:  { backgroundColor: 'rgba(95,191,122,0.15)', borderColor: 'rgba(95,191,122,0.25)', borderRadius: 99, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1 },
    featTagHidden: { backgroundColor: 'rgba(255,255,255,0.06)', borderColor: 'rgba(255,255,255,0.1)', borderRadius: 99, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1 },
    featTagText:   { fontSize: 9, fontFamily: 'Inter_600SemiBold' },
    featHint:   { fontSize: 10, textAlign: 'center', paddingBottom: 8, fontFamily: 'Inter_400Regular' },

    ctaWrap:    { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 16, paddingTop: 12, backgroundColor: 'transparent' },
    ctaBtn:     { backgroundColor: C.gold, borderRadius: 11, paddingVertical: 13, alignItems: 'center' },
    ctaBtnDisabled: { opacity: 0.3 },
    ctaBtnText: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: '#0e0a07' },
    ctaSkip:    { alignItems: 'center', paddingVertical: 8, marginTop: 4 },
    ctaSkipText:{ fontSize: 11, color: C.muted, fontFamily: 'Inter_400Regular' },
  });
}
