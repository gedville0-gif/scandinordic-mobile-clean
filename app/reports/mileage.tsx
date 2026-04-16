/**
 * REQUIRES: npx expo install expo-location
 * Add to app.json plugins: ["expo-location"]
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, Pressable, TextInput,
  Modal, KeyboardAvoidingView, Platform, Alert, AppState,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { COLORS } from '@/constants/colors';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAppDialog } from '@/components/AppDialog';
import DatePickerModal from '@/components/DatePickerModal';
import { getSettings } from '@/lib/storage';
import { formatCurrency } from '@/lib/currency';
import type { Currency } from '@/lib/types';

// expo-location + expo-task-manager — install with:
//   npx expo install expo-location expo-task-manager
let Location: any = null;
let TaskManager: any = null;
try { Location = require('expo-location'); } catch {}
try { TaskManager = require('expo-task-manager'); } catch {}

const MILEAGE_RATE    = 0.25;
const STORAGE_KEY     = 'mileage_journeys';
const BACKGROUND_TASK = 'MILEAGE_BACKGROUND_LOCATION';
const ACTIVE_KEY      = 'mileage_active_journey';

interface ActiveJourney {
  startTime: string;
  coords: Coordinate[];
  distanceKm: number;
  purpose: string;
}

interface Coordinate { lat: number; lng: number; }

interface Journey {
  id: string;
  date: string;
  from: string;
  to: string;
  purpose: string;
  distanceKm: number;
  deductible: number;
  coordinates?: Coordinate[];
  startTime?: string;
  endTime?: string;
  isGps?: boolean;
}

function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2); }

/** Haversine formula — returns distance in km */
function haversine(a: Coordinate, b: Coordinate): number {
  const R = 6371;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLon = (b.lng - a.lng) * Math.PI / 180;
  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const chord = sinLat * sinLat +
    Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * sinLon * sinLon;
  return R * 2 * Math.atan2(Math.sqrt(chord), Math.sqrt(1 - chord));
}

// ── Background location task (module-level, runs even when app is minimised) ─
if (TaskManager) {
  try {
    TaskManager.defineTask(BACKGROUND_TASK, async ({ data, error }: any) => {
      if (error || !data?.locations) return;
      try {
        const raw = await AsyncStorage.getItem(ACTIVE_KEY);
        if (!raw) return;
        const active: ActiveJourney = JSON.parse(raw);
        for (const loc of data.locations) {
          const coord: Coordinate = { lat: loc.coords.latitude, lng: loc.coords.longitude };
          if (active.coords.length > 0) {
            const last = active.coords[active.coords.length - 1];
            active.distanceKm += haversine(last, coord);
          }
          active.coords.push(coord);
        }
        await AsyncStorage.setItem(ACTIVE_KEY, JSON.stringify(active));
      } catch {}
    });
  } catch {}
}

function fmtElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  return h > 0
    ? `${h}:${String(m % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
    : `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

async function loadJourneys(): Promise<Journey[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

async function saveJourneys(journeys: Journey[]) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(journeys));
}

export default function MileageScreen() {
  const styles = makeStyles();
  const insets  = useSafeAreaInsets();
  const { t }   = useLanguage();
  const { show: showDialog, dialog } = useAppDialog();
  const [journeys, setJourneys] = useState<Journey[]>([]);
  const [currency, setCurrency] = useState<Currency>('EUR');
  const [showForm, setShowForm] = useState(false);

  // GPS tracking state
  const [tracking, setTracking] = useState(false);
  const [trackPurpose, setTrackPurpose] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [liveKm, setLiveKm] = useState(0);
  const [liveSpeed, setLiveSpeed] = useState(0);
  const [gpsError, setGpsError] = useState('');
  const coordsRef   = useRef<Coordinate[]>([]);
  const distRef     = useRef(0);
  const startRef    = useRef<Date | null>(null);
  const timerRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const watchRef    = useRef<any>(null);

  // Manual form state
  const [mFrom, setMFrom]       = useState('');
  const [mTo, setMTo]           = useState('');
  const [mPurpose, setMPurpose] = useState('');
  const [mKm, setMKm]           = useState('');
  const [mDate, setMDate]       = useState(new Date().toISOString().split('T')[0]);
  const [showMDatePicker, setShowMDatePicker] = useState(false);

  const load = useCallback(async () => {
    const [j, s] = await Promise.all([loadJourneys(), getSettings()]);
    setJourneys(j.sort((a, b) => b.date.localeCompare(a.date)));
    setCurrency(s.currency);
  }, []);

  // Restore active journey from AsyncStorage on mount
  useEffect(() => {
    load();
    AsyncStorage.getItem(ACTIVE_KEY).then(raw => {
      if (!raw) return;
      try {
        const active: ActiveJourney = JSON.parse(raw);
        distRef.current   = active.distanceKm;
        coordsRef.current = active.coords;
        startRef.current  = new Date(active.startTime);
        setTrackPurpose(active.purpose);
        setLiveKm(Math.round(active.distanceKm * 100) / 100);
        setElapsed(Date.now() - new Date(active.startTime).getTime());
        setTracking(true);
        timerRef.current = setInterval(() => {
          if (startRef.current) setElapsed(Date.now() - startRef.current.getTime());
        }, 1000);
      } catch {}
    });
  }, []);

  // Sync live distance from AsyncStorage when app returns to foreground
  useEffect(() => {
    const sub = AppState.addEventListener('change', async (state) => {
      if (state === 'active' && tracking) {
        try {
          const raw = await AsyncStorage.getItem(ACTIVE_KEY);
          if (!raw) return;
          const active: ActiveJourney = JSON.parse(raw);
          distRef.current   = active.distanceKm;
          coordsRef.current = active.coords;
          setLiveKm(Math.round(active.distanceKm * 100) / 100);
        } catch {}
      }
    });
    return () => sub.remove();
  }, [tracking]);

  // Only stop the timer on unmount — background task keeps running
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      // Don't stop background location — it persists even when tab is switched
    };
  }, []);

  const totalKm         = journeys.reduce((s, j) => s + j.distanceKm, 0);
  const totalDeductible = journeys.reduce((s, j) => s + j.deductible, 0);

  // ── GPS: Start Journey ────────────────────────────────────────────────────

  const startGpsJourney = async () => {
    if (!Location) {
      Alert.alert(t('gpsNotAvailable'), 'Run: npx expo install expo-location');
      return;
    }
    setGpsError('');
    // Request permission
    let fg = await Location.requestForegroundPermissionsAsync();
    if (fg.status !== 'granted') {
      setGpsError(t('locationPermissionDenied'));
      setShowForm(true);
      return;
    }
    // Try background permission (degrade gracefully if denied)
    try {
      const bg = await Location.requestBackgroundPermissionsAsync();
      if (bg.status !== 'granted') {
        setGpsError(t('backgroundLocationDenied'));
      }
    } catch {}

    coordsRef.current = [];
    distRef.current   = 0;
    startRef.current  = new Date();
    setLiveKm(0);
    setLiveSpeed(0);
    setElapsed(0);
    setTracking(true);

    // Persist active journey so background task and restoration can access it
    const active: ActiveJourney = {
      startTime: startRef.current.toISOString(),
      coords: [],
      distanceKm: 0,
      purpose: trackPurpose,
    };
    await AsyncStorage.setItem(ACTIVE_KEY, JSON.stringify(active));

    // Live timer
    timerRef.current = setInterval(() => {
      if (startRef.current) {
        setElapsed(Date.now() - startRef.current.getTime());
      }
    }, 1000);

    // Background location updates (continues when app is minimised)
    if (Location && TaskManager) {
      try {
        const alreadyRunning = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_TASK).catch(() => false);
        if (!alreadyRunning) {
          await Location.startLocationUpdatesAsync(BACKGROUND_TASK, {
            accuracy: Location.Accuracy.BestForNavigation,
            timeInterval: 5000,
            distanceInterval: 10,
            showsBackgroundLocationIndicator: true,
            foregroundService: {
              notificationTitle: 'ScandiNordic Mileage',
              notificationBody: 'Tracking your journey…',
            },
          });
        }
      } catch {}
    }

    // Foreground watch for real-time UI updates
    watchRef.current = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.BestForNavigation,
        timeInterval: 5000,
        distanceInterval: 10,
      },
      (pos: any) => {
        const coord: Coordinate = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        if (coordsRef.current.length > 0) {
          const last  = coordsRef.current[coordsRef.current.length - 1];
          distRef.current += haversine(last, coord);
          setLiveKm(Math.round(distRef.current * 100) / 100);
        }
        coordsRef.current.push(coord);
        const speedMs = pos.coords.speed ?? 0;
        setLiveSpeed(Math.max(0, Math.round(speedMs * 3.6))); // m/s → km/h
        // Keep AsyncStorage in sync for background/foreground transitions
        AsyncStorage.getItem(ACTIVE_KEY).then(raw => {
          if (!raw) return;
          try {
            const a: ActiveJourney = JSON.parse(raw);
            a.coords = coordsRef.current;
            a.distanceKm = distRef.current;
            AsyncStorage.setItem(ACTIVE_KEY, JSON.stringify(a));
          } catch {}
        });
      },
    );
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  // ── GPS: Stop Journey ─────────────────────────────────────────────────────

  const stopGpsJourney = async () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (watchRef.current) { watchRef.current.remove?.(); watchRef.current = null; }

    // Stop background location task
    if (Location && TaskManager) {
      try {
        const running = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_TASK).catch(() => false);
        if (running) await Location.stopLocationUpdatesAsync(BACKGROUND_TASK).catch(() => {});
      } catch {}
    }

    // Read final state from AsyncStorage (background task may have added coords)
    try {
      const raw = await AsyncStorage.getItem(ACTIVE_KEY);
      if (raw) {
        const active: ActiveJourney = JSON.parse(raw);
        distRef.current   = active.distanceKm;
        coordsRef.current = active.coords;
      }
    } catch {}
    await AsyncStorage.removeItem(ACTIVE_KEY).catch(() => {});

    setTracking(false);

    const km        = Math.round(distRef.current * 100) / 100;
    const deductible = Math.round(km * MILEAGE_RATE * 100) / 100;
    const end       = new Date();
    const start     = startRef.current ?? end;

    if (km < 0.01) {
      Alert.alert(t('journeyTooShort'), t('minDistRequired'));
      return;
    }

    const journey: Journey = {
      id:          genId(),
      date:        start.toISOString().split('T')[0],
      from:        coordsRef.current[0]
        ? `${coordsRef.current[0].lat.toFixed(4)},${coordsRef.current[0].lng.toFixed(4)}`
        : 'GPS Start',
      to:          coordsRef.current.length > 1
        ? `${coordsRef.current[coordsRef.current.length - 1].lat.toFixed(4)},${coordsRef.current[coordsRef.current.length - 1].lng.toFixed(4)}`
        : 'GPS End',
      purpose:     trackPurpose || 'GPS Journey',
      distanceKm:  km,
      deductible,
      coordinates: coordsRef.current,
      startTime:   start.toISOString(),
      endTime:     end.toISOString(),
      isGps:       true,
    };

    const updated = [journey, ...journeys];
    setJourneys(updated);
    await saveJourneys(updated);
    setTrackPurpose('');

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert(
      t('journeySaved'),
      `${km.toFixed(2)} km · ${formatCurrency(deductible, currency)} ${t('deductible')}\n(${MILEAGE_RATE.toFixed(2)} ${currency}/km)`,
    );
  };

  // ── Manual: Save Journey ──────────────────────────────────────────────────

  const resetForm = () => { setMFrom(''); setMTo(''); setMPurpose(''); setMKm(''); setMDate(new Date().toISOString().split('T')[0]); };

  const saveManualJourney = async () => {
    const km = parseFloat(mKm.replace(',', '.'));
    if (isNaN(km) || km <= 0) { Alert.alert(t('invalidDistance')); return; }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const journey: Journey = {
      id: genId(),
      date: mDate,
      from: mFrom || 'Unknown',
      to: mTo || 'Unknown',
      purpose: mPurpose || 'Other',
      distanceKm: km,
      deductible: Math.round(km * MILEAGE_RATE * 100) / 100,
    };
    const updated = [journey, ...journeys];
    setJourneys(updated);
    await saveJourneys(updated);
    setShowForm(false);
    resetForm();
  };

  const deleteJourney = async (id: string) => {
    const idx = await showDialog(t('delete'), t('removeThisJourney'), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('delete'), style: 'destructive' },
    ]);
    if (idx === 1) {
      const updated = journeys.filter(j => j.id !== id);
      setJourneys(updated);
      await saveJourneys(updated);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <Pressable style={styles.back} onPress={() => router.back()}>
          <Feather name="arrow-left" size={18} color={COLORS.primary} />
          <Text style={styles.backText}>{t('reports')}</Text>
        </Pressable>
        <Text style={styles.badge}>◆ ScandiNordic Pro ◆</Text>
        <View style={styles.titleRow}>
          <Text style={styles.title}>{t('mileage')} 🚗</Text>
          <Pressable style={styles.addBtn} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowForm(true); }}>
            <Feather name="plus" size={18} color={COLORS.primary} />
          </Pressable>
        </View>
        <View style={styles.divider} />

        {/* GPS Error */}
        {gpsError ? <Text style={styles.gpsError}>{gpsError}</Text> : null}

        {/* GPS Tracking Panel */}
        {tracking ? (
          <View style={styles.trackingCard}>
            <View style={styles.trackingHeader}>
              <View style={styles.trackingDot} />
              <Text style={styles.trackingTitle}>{t('journeyActive').toUpperCase()}</Text>
            </View>
            <View style={styles.trackingStats}>
              <View style={styles.trackingStat}>
                <Text style={styles.trackingStatVal}>{liveKm.toFixed(2)}</Text>
                <Text style={styles.trackingStatLabel}>km</Text>
              </View>
              <View style={styles.trackingStat}>
                <Text style={styles.trackingStatVal}>{liveSpeed}</Text>
                <Text style={styles.trackingStatLabel}>km/h</Text>
              </View>
              <View style={styles.trackingStat}>
                <Text style={styles.trackingStatVal}>{fmtElapsed(elapsed)}</Text>
                <Text style={styles.trackingStatLabel}>{t('elapsed')}</Text>
              </View>
              <View style={styles.trackingStat}>
                <Text style={[styles.trackingStatVal, { color: COLORS.success }]}>
                  {formatCurrency(Math.round(liveKm * MILEAGE_RATE * 100) / 100, currency)}
                </Text>
                <Text style={styles.trackingStatLabel}>{t('deductible')}</Text>
              </View>
            </View>
            <TextInput
              style={styles.trackingInput}
              value={trackPurpose}
              onChangeText={setTrackPurpose}
              placeholder={t('purposePlaceholder')}
              placeholderTextColor={COLORS.muted}
            />
            <Pressable style={styles.stopBtn} onPress={stopGpsJourney}>
              <Feather name="square" size={16} color={COLORS.background} />
              <Text style={styles.stopBtnText}>{t('stopSave')}</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable style={styles.startBtn} onPress={startGpsJourney}>
            <Feather name="navigation" size={20} color={COLORS.background} />
            <Text style={styles.startBtnText}>{t('startGpsJourney')}</Text>
          </Pressable>
        )}

        {/* Summary */}
        <View style={styles.summaryRow}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>{t('totalKm')}</Text>
            <Text style={[styles.summaryValue, { color: COLORS.primary }]}>{totalKm.toFixed(1)} km</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>{t('trips')}</Text>
            <Text style={[styles.summaryValue, { color: COLORS.text }]}>{journeys.length}</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>{t('deductible')}</Text>
            <Text style={[styles.summaryValue, { color: COLORS.success }]}>{formatCurrency(totalDeductible, currency)}</Text>
          </View>
        </View>

        {/* Rate info */}
        <View style={styles.rateCard}>
          <Text style={styles.rateLabel}>{t('taxFreeRate')}</Text>
          <Text style={styles.rateValue}>{MILEAGE_RATE.toFixed(2)} {currency}/km</Text>
        </View>

        {/* Journey log */}
        <Text style={styles.sectionLabel}>{t('journeyLog')} ({journeys.length})</Text>
        {journeys.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>🗺️</Text>
            <Text style={styles.emptyText}>{t('noJourneysYet')}</Text>
            <Pressable style={styles.emptyBtn} onPress={() => setShowForm(true)}>
              <Text style={styles.emptyBtnText}>{t('addManually')}</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.list}>
            {journeys.map((j, i) => (
              <Pressable
                key={j.id}
                style={[styles.journeyRow, i > 0 && { borderTopWidth: 1, borderTopColor: COLORS.border }]}
                onLongPress={() => deleteJourney(j.id)}
              >
                <View style={styles.journeyIcon}>
                  <Text style={{ fontSize: 16 }}>{j.isGps ? '📡' : '🚗'}</Text>
                </View>
                <View style={styles.journeyInfo}>
                  <Text style={styles.journeyRoute}>{j.from} → {j.to}</Text>
                  <Text style={styles.journeyMeta}>{j.purpose} · {j.date}{j.isGps ? ' · GPS' : ''}</Text>
                </View>
                <View style={styles.journeyRight}>
                  <Text style={styles.journeyKm}>{j.distanceKm.toFixed(2)} km</Text>
                  <Text style={styles.journeyDeductible}>{formatCurrency(j.deductible, currency)}</Text>
                </View>
              </Pressable>
            ))}
          </View>
        )}

        <Text style={styles.hint}>{t('longPressToDelete')}</Text>
        <Text style={styles.version}>◆ ScandiNordic Pro v.2</Text>
      </ScrollView>

      {/* Manual Add Modal */}
      <Modal visible={showForm} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => { setShowForm(false); resetForm(); }}>
        <KeyboardAvoidingView style={{ flex: 1, backgroundColor: COLORS.background }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={[styles.modalHeader, { paddingTop: insets.top + 16 }]}>
            <Pressable onPress={() => { setShowForm(false); resetForm(); }}>
              <Text style={styles.modalCancel}>{t('cancel')}</Text>
            </Pressable>
            <Text style={styles.modalTitle}>{t('addManually')}</Text>
            <Pressable onPress={saveManualJourney}>
              <Text style={styles.modalSave}>{t('save')}</Text>
            </Pressable>
          </View>
          <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled">
            <View style={styles.twoCol}>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>{t('from')}</Text>
                <TextInput style={styles.input} value={mFrom} onChangeText={setMFrom} placeholder="Helsinki" placeholderTextColor={COLORS.muted} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>{t('to')}</Text>
                <TextInput style={styles.input} value={mTo} onChangeText={setMTo} placeholder="Vantaa" placeholderTextColor={COLORS.muted} />
              </View>
            </View>
            <View style={styles.twoCol}>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>{t('distanceKm')}</Text>
                <TextInput style={styles.input} value={mKm} onChangeText={setMKm} placeholder="0.0" placeholderTextColor={COLORS.muted} keyboardType="decimal-pad" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>{t('date')}</Text>
                <Pressable style={[styles.input, { justifyContent: 'center' }]} onPress={() => setShowMDatePicker(true)}>
                  <Text style={{ color: COLORS.text, fontSize: 13 }}>{mDate}</Text>
                </Pressable>
                <DatePickerModal
                  visible={showMDatePicker}
                  value={mDate}
                  onConfirm={d => { setMDate(d); setShowMDatePicker(false); }}
                  onCancel={() => setShowMDatePicker(false)}
                  title={t('date')}
                />
              </View>
            </View>
            <Text style={styles.fieldLabel}>{t('purpose')}</Text>
            <TextInput style={styles.input} value={mPurpose} onChangeText={setMPurpose} placeholder={t('purposePlaceholder')} placeholderTextColor={COLORS.muted} />
            {parseFloat(mKm) > 0 && (
              <View style={styles.deductPreview}>
                <Text style={styles.deductLabel}>{t('deductible')}</Text>
                <Text style={styles.deductValue}>{formatCurrency(Math.round(parseFloat(mKm) * MILEAGE_RATE * 100) / 100, currency)}</Text>
              </View>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
      {dialog}
    </View>
  );
}

const makeStyles = () => StyleSheet.create({
  content: { paddingHorizontal: 20, gap: 12 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  backText: { fontSize: 14, color: COLORS.primary, fontWeight: '500' },
  badge: { fontSize: 9, color: COLORS.primary, letterSpacing: 4, textTransform: 'uppercase' },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  title: { fontSize: 24, fontWeight: '700', color: COLORS.text, letterSpacing: -0.5 },
  addBtn: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.primaryDim, borderWidth: 1, borderColor: COLORS.primary + '40' },
  divider: { height: 1, backgroundColor: COLORS.border },

  gpsError: { fontSize: 11, color: COLORS.warning, backgroundColor: COLORS.warningDim, borderRadius: 10, padding: 10, borderWidth: 1, borderColor: COLORS.warning + '40' },

  // GPS tracking card
  trackingCard: { backgroundColor: COLORS.card, borderRadius: 16, borderWidth: 1, borderColor: COLORS.danger + '50', padding: 16, gap: 14 },
  trackingHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  trackingDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.danger },
  trackingTitle: { fontSize: 12, fontWeight: '700', color: COLORS.danger, textTransform: 'uppercase', letterSpacing: 1 },
  trackingStats: { flexDirection: 'row', gap: 8 },
  trackingStat: { flex: 1, alignItems: 'center', backgroundColor: COLORS.surface, borderRadius: 10, paddingVertical: 10, gap: 2 },
  trackingStatVal: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  trackingStatLabel: { fontSize: 9, color: COLORS.muted, textTransform: 'uppercase', letterSpacing: 0.5 },
  trackingInput: { backgroundColor: COLORS.input, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, color: COLORS.text, fontSize: 13, paddingHorizontal: 12, paddingVertical: 10 },
  stopBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: COLORS.danger, borderRadius: 12, paddingVertical: 14 },
  stopBtnText: { fontSize: 13, fontWeight: '700', color: COLORS.background, textTransform: 'uppercase', letterSpacing: 1 },

  // Start button
  startBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: COLORS.primary, borderRadius: 14, paddingVertical: 16 },
  startBtnText: { fontSize: 14, fontWeight: '700', color: COLORS.background, textTransform: 'uppercase', letterSpacing: 1 },

  summaryRow: { flexDirection: 'row', gap: 8 },
  summaryCard: { flex: 1, backgroundColor: COLORS.card, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, padding: 12, gap: 4 },
  summaryLabel: { fontSize: 9, color: COLORS.muted, textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: '600' },
  summaryValue: { fontSize: 14, fontWeight: '700' },
  rateCard: { backgroundColor: COLORS.card, borderRadius: 12, borderWidth: 1, borderColor: COLORS.primary + '30', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10 },
  rateLabel: { fontSize: 11, color: COLORS.muted },
  rateValue: { fontSize: 13, fontWeight: '700', color: COLORS.primary },
  sectionLabel: { fontSize: 10, color: COLORS.muted, textTransform: 'uppercase', letterSpacing: 1.5, fontWeight: '600' },
  list: { backgroundColor: COLORS.card, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden' },
  journeyRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 },
  journeyIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: COLORS.primaryDim, alignItems: 'center', justifyContent: 'center' },
  journeyInfo: { flex: 1, gap: 2 },
  journeyRoute: { fontSize: 13, fontWeight: '600', color: COLORS.text },
  journeyMeta: { fontSize: 10, color: COLORS.muted },
  journeyRight: { alignItems: 'flex-end', gap: 2 },
  journeyKm: { fontSize: 13, fontWeight: '700', color: COLORS.text },
  journeyDeductible: { fontSize: 11, color: COLORS.success, fontWeight: '600' },
  empty: { alignItems: 'center', paddingTop: 40, gap: 10 },
  emptyIcon: { fontSize: 36 },
  emptyText: { fontSize: 14, color: COLORS.muted },
  emptyBtn: { backgroundColor: COLORS.primaryDim, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20, borderWidth: 1, borderColor: COLORS.primary + '40' },
  emptyBtnText: { fontSize: 13, fontWeight: '600', color: COLORS.primary },
  hint: { fontSize: 10, color: COLORS.muted + '80', textAlign: 'center' },
  version: { textAlign: 'center', fontSize: 9, color: COLORS.muted + '60', letterSpacing: 4, marginTop: 8 },

  // Modal
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  modalTitle: { fontSize: 16, fontWeight: '600', color: COLORS.text },
  modalCancel: { fontSize: 15, color: COLORS.textSecondary },
  modalSave: { fontSize: 15, fontWeight: '600', color: COLORS.primary },
  modalBody: { padding: 20 },
  twoCol: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  fieldLabel: { fontSize: 10, fontWeight: '600', color: COLORS.muted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 },
  input: { backgroundColor: COLORS.card, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, color: COLORS.text, fontSize: 14, paddingHorizontal: 14, height: 48, marginBottom: 0 },
  deductPreview: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: COLORS.successDim, borderRadius: 10, borderWidth: 1, borderColor: COLORS.success + '30', paddingHorizontal: 14, paddingVertical: 10, marginTop: 8 },
  deductLabel: { fontSize: 12, color: COLORS.success },
  deductValue: { fontSize: 15, fontWeight: '700', color: COLORS.success },
});
