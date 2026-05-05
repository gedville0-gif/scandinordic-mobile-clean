/**
 * REQUIRES: npx expo install expo-location expo-task-manager
 * Add to app.json plugins: ["expo-location"]
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, Pressable, TextInput,
  Modal, KeyboardAvoidingView, Platform, AppState,
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
import { supabase } from '@/lib/supabase';
import { getCurrentUserId } from '@/lib/session';
import { formatCurrency } from '@/lib/currency';
import type { Currency } from '@/lib/types';

let Location: any = null;
let TaskManager: any = null;
try { Location = require('expo-location'); } catch {}
try { TaskManager = require('expo-task-manager'); } catch {}

// ── Travel Mode Config ────────────────────────────────────────────────────────

type TravelCategory = 'km' | 'receipt' | 'allowance';
type TravelMode =
  | 'car' | 'motorcycle' | 'moped' | 'snowmobile' | 'atv' | 'bicycle'
  | 'taxi' | 'bus' | 'train' | 'flight'
  | 'meal';

interface ModeConfig {
  id: TravelMode;
  label: string;
  icon: string;
  category: TravelCategory;
  rate?: number;
  rateLabel: string;
}

const TRAVEL_MODES: ModeConfig[] = [
  { id: 'car',        label: 'Car',            icon: '🚗', category: 'km',        rate: 0.55, rateLabel: '0.55 €/km' },
  { id: 'motorcycle', label: 'Motorcycle',      icon: '🏍️', category: 'km',        rate: 0.42, rateLabel: '0.42 €/km' },
  { id: 'moped',      label: 'Moped',           icon: '🛵', category: 'km',        rate: 0.23, rateLabel: '0.23 €/km' },
  { id: 'snowmobile', label: 'Snowmobile',      icon: '🛷', category: 'km',        rate: 1.34, rateLabel: '1.34 €/km' },
  { id: 'atv',        label: 'ATV / Quadbike',  icon: '🏎️', category: 'km',        rate: 1.26, rateLabel: '1.26 €/km' },
  { id: 'bicycle',    label: 'Bicycle / Other', icon: '🚲', category: 'km',        rate: 0.13, rateLabel: '0.13 €/km' },
  { id: 'taxi',       label: 'Taxi',            icon: '🚕', category: 'receipt',               rateLabel: 'Actual fare' },
  { id: 'bus',        label: 'Bus',             icon: '🚌', category: 'receipt',               rateLabel: 'Ticket price' },
  { id: 'train',      label: 'Train',           icon: '🚂', category: 'receipt',               rateLabel: 'Ticket price' },
  { id: 'flight',     label: 'Flight',          icon: '✈️',  category: 'receipt',               rateLabel: 'Ticket price' },
  { id: 'meal',       label: 'Meal Allowance',  icon: '🍽️', category: 'allowance',             rateLabel: '€25–€54' },
];

const MEAL_RATES = { sixHour: 25, tenHour: 54 };

function getModeConfig(id?: TravelMode): ModeConfig {
  return TRAVEL_MODES.find(m => m.id === id) ?? TRAVEL_MODES[0];
}

function calcMealAllowance(hours: number): number {
  if (hours >= 10) return MEAL_RATES.tenHour;
  if (hours >= 6)  return MEAL_RATES.sixHour;
  return 0;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const BACKGROUND_TASK = 'MILEAGE_BACKGROUND_LOCATION';
const ACTIVE_KEY      = 'mileage_active_journey';

// ── Types ─────────────────────────────────────────────────────────────────────

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
  travelMode?: TravelMode;
  notes?: string;
  receiptAmount?: number;
  hoursAway?: number;
  coordinates?: Coordinate[];
  startTime?: string;
  endTime?: string;
  isGps?: boolean;
}

// ── Pure helpers ──────────────────────────────────────────────────────────────

function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2); }

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

async function reverseGeocode(coord: Coordinate, fallback: string): Promise<string> {
  if (!Location) return fallback;
  try {
    const results = await Location.reverseGeocodeAsync({ latitude: coord.lat, longitude: coord.lng });
    if (!results?.length) return fallback;
    const place  = results[0];
    const city   = place.city || place.subregion || place.region || '';
    const street = place.street || place.name || '';
    if (city && street) return `${city}, ${street}`;
    if (city) return city;
    if (street) return street;
    return fallback;
  } catch {
    return fallback;
  }
}

function fmtElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  return h > 0
    ? `${h}:${String(m % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
    : `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

// ── Background location task (module-level — runs when app is minimised) ─────

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

// ── Supabase I/O ──────────────────────────────────────────────────────────────

async function loadJourneys(): Promise<Journey[]> {
  const userId = getCurrentUserId();
  if (!userId) return [];
  const { data, error } = await supabase
    .from('mileage_journeys')
    .select('data')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) { console.error('[mileage_journeys] fetch failed:', error); return []; }
  return (data ?? []).map(row => row.data as Journey);
}

async function saveJourneys(journeys: Journey[]) {
  const userId = getCurrentUserId();
  if (!userId) return;
  await supabase.from('mileage_journeys').delete().eq('user_id', userId);
  if (journeys.length === 0) return;
  const rows = journeys.map(j => ({ id: j.id, user_id: userId, data: j }));
  const { error } = await supabase.from('mileage_journeys').insert(rows);
  if (error) console.error('[mileage_journeys] insert failed:', error);
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function MileageScreen() {
  const styles = makeStyles();
  const insets = useSafeAreaInsets();
  const { t }  = useLanguage();
  const { show: showDialog, dialog } = useAppDialog();

  const [journeys, setJourneys] = useState<Journey[]>([]);
  const [currency, setCurrency] = useState<Currency>('EUR');

  // Active travel mode — persisted via ref for use in async GPS callbacks
  const [activeMode, setActiveMode] = useState<TravelMode>('car');
  const activeModeRef = useRef<TravelMode>('car');
  const syncMode = (m: TravelMode) => { setActiveMode(m); activeModeRef.current = m; };

  // Modal visibility
  const [showModePicker, setShowModePicker] = useState(false);
  const [pickerStep, setPickerStep]         = useState<'select' | 'km-action'>('select');
  const [showKmForm, setShowKmForm]         = useState(false);
  const [showReceiptForm, setShowReceiptForm] = useState(false);
  const [showMealForm, setShowMealForm]     = useState(false);

  // GPS tracking state — UNCHANGED from original
  const [tracking, setTracking]     = useState(false);
  const [trackPurpose, setTrackPurpose] = useState('');
  const [elapsed, setElapsed]       = useState(0);
  const [liveKm, setLiveKm]         = useState(0);
  const [liveSpeed, setLiveSpeed]   = useState(0);
  const [gpsError, setGpsError]     = useState('');
  const coordsRef = useRef<Coordinate[]>([]);
  const distRef   = useRef(0);
  const startRef  = useRef<Date | null>(null);
  const timerRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const watchRef  = useRef<any>(null);

  // Manual KM form state
  const [mFrom, setMFrom]       = useState('');
  const [mTo, setMTo]           = useState('');
  const [mPurpose, setMPurpose] = useState('');
  const [mKm, setMKm]           = useState('');
  const [mDate, setMDate]       = useState(new Date().toISOString().split('T')[0]);
  const [showMDatePicker, setShowMDatePicker] = useState(false);

  // Receipt form state
  const [rFrom, setRFrom]     = useState('');
  const [rTo, setRTo]         = useState('');
  const [rAmount, setRAmount] = useState('');
  const [rNotes, setRNotes]   = useState('');
  const [rDate, setRDate]     = useState(new Date().toISOString().split('T')[0]);
  const [showRDatePicker, setShowRDatePicker] = useState(false);

  // Meal allowance form state
  const [mealHours, setMealHours] = useState('');
  const [mealNotes, setMealNotes] = useState('');
  const [mealDate, setMealDate]   = useState(new Date().toISOString().split('T')[0]);
  const [showMealDatePicker, setShowMealDatePicker] = useState(false);

  // ── Data loading ────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    const [j, s] = await Promise.all([loadJourneys(), getSettings()]);
    setJourneys(j.sort((a, b) => b.date.localeCompare(a.date)));
    setCurrency(s.currency);
  }, []);

  // Restore active journey from AsyncStorage on mount — UNCHANGED
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

  // Sync live distance when app returns to foreground — UNCHANGED
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

  // Stop timer on unmount only — background task keeps running — UNCHANGED
  useEffect(() => {
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  // ── Computed values ─────────────────────────────────────────────────────────

  const totalKm            = journeys.filter(j => j.distanceKm > 0).reduce((s, j) => s + j.distanceKm, 0);
  const totalReimbursement = journeys.reduce((s, j) => s + j.deductible, 0);

  const breakdown = TRAVEL_MODES.reduce<Record<string, number>>((acc, m) => {
    const sum = journeys.filter(j => j.travelMode === m.id).reduce((s, j) => s + j.deductible, 0);
    if (sum > 0) acc[m.id] = sum;
    return acc;
  }, {});
  const legacySum = journeys.filter(j => !j.travelMode).reduce((s, j) => s + j.deductible, 0);

  const activeModeConfig = getModeConfig(activeMode);
  const liveRate         = activeModeConfig.rate ?? 0.55;

  // ── GPS: Start Journey — UNCHANGED logic ────────────────────────────────────

  const startGpsJourney = async () => {
    if (!Location) {
      await showDialog(t('gpsNotAvailable'), 'Run: npx expo install expo-location');
      return;
    }
    setGpsError('');
    const fg = await Location.requestForegroundPermissionsAsync();
    if (fg.status !== 'granted') {
      setGpsError(t('locationPermissionDenied'));
      return;
    }
    try {
      const bg = await Location.requestBackgroundPermissionsAsync();
      if (bg.status !== 'granted') setGpsError(t('backgroundLocationDenied'));
    } catch {}

    coordsRef.current = [];
    distRef.current   = 0;
    startRef.current  = new Date();
    setLiveKm(0);
    setLiveSpeed(0);
    setElapsed(0);
    setTracking(true);

    const active: ActiveJourney = {
      startTime: startRef.current.toISOString(),
      coords: [],
      distanceKm: 0,
      purpose: trackPurpose,
    };
    await AsyncStorage.setItem(ACTIVE_KEY, JSON.stringify(active));

    timerRef.current = setInterval(() => {
      if (startRef.current) setElapsed(Date.now() - startRef.current.getTime());
    }, 1000);

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

    watchRef.current = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 5000, distanceInterval: 10 },
      (pos: any) => {
        const coord: Coordinate = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        if (coordsRef.current.length > 0) {
          const last = coordsRef.current[coordsRef.current.length - 1];
          distRef.current += haversine(last, coord);
          setLiveKm(Math.round(distRef.current * 100) / 100);
        }
        coordsRef.current.push(coord);
        setLiveSpeed(Math.max(0, Math.round((pos.coords.speed ?? 0) * 3.6)));
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

  // ── GPS: Stop Journey — uses activeModeRef for rate ─────────────────────────

  const stopGpsJourney = async () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (watchRef.current) { watchRef.current.remove?.(); watchRef.current = null; }

    if (Location && TaskManager) {
      try {
        const running = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_TASK).catch(() => false);
        if (running) await Location.stopLocationUpdatesAsync(BACKGROUND_TASK).catch(() => {});
      } catch {}
    }

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

    const mode       = activeModeRef.current;
    const config     = getModeConfig(mode);
    const rate       = config.rate ?? 0.55;
    const km         = Math.round(distRef.current * 100) / 100;
    const deductible = Math.round(km * rate * 100) / 100;
    const end        = new Date();
    const start      = startRef.current ?? end;

    if (km < 0.01) { await showDialog(t('journeyTooShort'), t('minDistRequired')); return; }

    const startCoord = coordsRef.current[0];
    const endCoord   = coordsRef.current.length > 1 ? coordsRef.current[coordsRef.current.length - 1] : null;
    const [fromName, toName] = await Promise.all([
      startCoord ? reverseGeocode(startCoord, 'GPS Start') : Promise.resolve('GPS Start'),
      endCoord   ? reverseGeocode(endCoord,   'GPS End')   : Promise.resolve('GPS End'),
    ]);

    const journey: Journey = {
      id:          genId(),
      date:        start.toISOString().split('T')[0],
      from:        fromName,
      to:          toName,
      purpose:     trackPurpose || 'GPS Journey',
      distanceKm:  km,
      deductible,
      travelMode:  mode,
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
    await showDialog(
      t('journeySaved'),
      `${config.icon} ${config.label} · ${km.toFixed(2)} km\n${formatCurrency(deductible, currency)} ${t('deductible')} (${rate.toFixed(2)} €/km)`,
    );
  };

  // ── Manual KM form ──────────────────────────────────────────────────────────

  const resetKmForm = () => {
    setMFrom(''); setMTo(''); setMPurpose(''); setMKm('');
    setMDate(new Date().toISOString().split('T')[0]);
  };

  const saveManualJourney = async () => {
    const km = parseFloat(mKm.replace(',', '.'));
    if (isNaN(km) || km <= 0) { await showDialog(t('invalidDistance')); return; }
    const config = getModeConfig(activeMode);
    const rate   = config.rate ?? 0.55;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const journey: Journey = {
      id:         genId(),
      date:       mDate,
      from:       mFrom || 'Unknown',
      to:         mTo   || 'Unknown',
      purpose:    mPurpose || 'Other',
      distanceKm: km,
      deductible: Math.round(km * rate * 100) / 100,
      travelMode: activeMode,
    };
    const updated = [journey, ...journeys];
    setJourneys(updated);
    await saveJourneys(updated);
    setShowKmForm(false);
    resetKmForm();
  };

  // ── Receipt form ────────────────────────────────────────────────────────────

  const resetReceiptForm = () => {
    setRFrom(''); setRTo(''); setRAmount(''); setRNotes('');
    setRDate(new Date().toISOString().split('T')[0]);
  };

  const saveReceiptJourney = async () => {
    const amount = parseFloat(rAmount.replace(',', '.'));
    if (isNaN(amount) || amount <= 0) { await showDialog(t('invalidAmount') || 'Enter a valid amount'); return; }
    const config = getModeConfig(activeMode);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const journey: Journey = {
      id:            genId(),
      date:          rDate,
      from:          rFrom || 'Unknown',
      to:            rTo   || 'Unknown',
      purpose:       config.label,
      distanceKm:    0,
      deductible:    Math.round(amount * 100) / 100,
      travelMode:    activeMode,
      receiptAmount: amount,
      notes:         rNotes || undefined,
    };
    const updated = [journey, ...journeys];
    setJourneys(updated);
    await saveJourneys(updated);
    setShowReceiptForm(false);
    resetReceiptForm();
  };

  // ── Meal allowance form ─────────────────────────────────────────────────────

  const resetMealForm = () => {
    setMealHours(''); setMealNotes('');
    setMealDate(new Date().toISOString().split('T')[0]);
  };

  const saveMealAllowance = async () => {
    const hours     = parseFloat(mealHours.replace(',', '.'));
    if (isNaN(hours) || hours <= 0) { await showDialog(t('invalidDistance')); return; }
    const allowance = calcMealAllowance(hours);
    if (allowance === 0) {
      await showDialog(t('mealUnder6h'), t('mealUnder6hHint'));
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const journey: Journey = {
      id:         genId(),
      date:       mealDate,
      from:       'Home',
      to:         'Away',
      purpose:    `${t('mealAllowance')} (${hours}h)`,
      distanceKm: 0,
      deductible: allowance,
      travelMode: 'meal',
      hoursAway:  hours,
      notes:      mealNotes || undefined,
    };
    const updated = [journey, ...journeys];
    setJourneys(updated);
    await saveJourneys(updated);
    setShowMealForm(false);
    resetMealForm();
  };

  // ── Delete ──────────────────────────────────────────────────────────────────

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

  // ── Mode picker helpers ─────────────────────────────────────────────────────

  const openModePicker = () => {
    setPickerStep('select');
    setShowModePicker(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const onModeSelect = (config: ModeConfig) => {
    syncMode(config.id);
    if (config.category === 'km') {
      setPickerStep('km-action');
    } else if (config.category === 'receipt') {
      setRDate(new Date().toISOString().split('T')[0]);
      setShowModePicker(false);
      setShowReceiptForm(true);
    } else {
      setMealDate(new Date().toISOString().split('T')[0]);
      setShowModePicker(false);
      setShowMealForm(true);
    }
    Haptics.selectionAsync();
  };

  const closePicker = () => { setShowModePicker(false); setPickerStep('select'); };

  const kmModes      = TRAVEL_MODES.filter(m => m.category === 'km');
  const receiptModes = TRAVEL_MODES.filter(m => m.category === 'receipt');
  const allowModes   = TRAVEL_MODES.filter(m => m.category === 'allowance');

  // ── Meal preview helper (IIFE inside JSX avoids extra component) ────────────

  const mealPreview = (() => {
    const h = parseFloat(mealHours.replace(',', '.'));
    if (!mealHours || isNaN(h) || h <= 0) return null;
    const a = calcMealAllowance(h);
    return { allowance: a, isZero: a === 0 };
  })();

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <Pressable style={styles.back} onPress={() => router.back()} hitSlop={10}>
          <Feather name="arrow-left" size={28} color={COLORS.primary} />
          <Text style={styles.backText}>{t('reports')}</Text>
        </Pressable>
        <Text style={styles.badge}>◆ ScandiNordic Pro ◆</Text>
        <View style={styles.titleRow}>
          <Text style={styles.title}>{t('travelEntry')}</Text>
          <Pressable style={styles.addBtn} onPress={openModePicker}>
            <Feather name="plus" size={18} color={COLORS.primary} />
          </Pressable>
        </View>
        <View style={styles.divider} />

        {/* GPS permission error */}
        {gpsError ? <Text style={styles.gpsError}>{gpsError}</Text> : null}

        {/* GPS Tracking Panel (active) or Add Entry hint */}
        {tracking ? (
          <View style={styles.trackingCard}>
            <View style={styles.trackingHeader}>
              <View style={styles.trackingDot} />
              <Text style={styles.trackingTitle}>{t('journeyActive').toUpperCase()}</Text>
              <View style={styles.trackingModeBadge}>
                <Text style={styles.trackingModeText}>{activeModeConfig.icon} {activeModeConfig.label}</Text>
              </View>
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
                  {formatCurrency(Math.round(liveKm * liveRate * 100) / 100, currency)}
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
          <Pressable style={styles.addEntryHint} onPress={openModePicker}>
            <Feather name="plus-circle" size={18} color={COLORS.primary} />
            <Text style={styles.addEntryHintText}>{t('addTravelEntry')}</Text>
          </Pressable>
        )}

        {/* Summary cards */}
        <View style={styles.summaryRow}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>{t('trips')}</Text>
            <Text style={[styles.summaryValue, { color: COLORS.text }]}>{journeys.length}</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>{t('totalKm')}</Text>
            <Text style={[styles.summaryValue, { color: COLORS.primary }]}>{totalKm.toFixed(1)} km</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>{t('totalReimbursement')}</Text>
            <Text style={[styles.summaryValue, { color: COLORS.success, fontSize: 12 }]}>
              {formatCurrency(totalReimbursement, currency)}
            </Text>
          </View>
        </View>

        {/* Category breakdown */}
        {(Object.keys(breakdown).length > 0 || legacySum > 0) && (
          <View style={styles.breakdownCard}>
            <Text style={styles.breakdownTitle}>{t('categoryBreakdown')}</Text>
            {Object.entries(breakdown).map(([modeId, sum]) => {
              const cfg = getModeConfig(modeId as TravelMode);
              return (
                <View key={modeId} style={styles.breakdownRow}>
                  <Text style={styles.breakdownIcon}>{cfg.icon}</Text>
                  <Text style={styles.breakdownLabel}>{cfg.label}</Text>
                  <Text style={styles.breakdownAmount}>{formatCurrency(sum, currency)}</Text>
                </View>
              );
            })}
            {legacySum > 0 && (
              <View style={styles.breakdownRow}>
                <Text style={styles.breakdownIcon}>🚗</Text>
                <Text style={styles.breakdownLabel}>Car (legacy)</Text>
                <Text style={styles.breakdownAmount}>{formatCurrency(legacySum, currency)}</Text>
              </View>
            )}
          </View>
        )}

        {/* Journey log */}
        <Text style={styles.sectionLabel}>{t('journeyLog')} ({journeys.length})</Text>
        {journeys.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>🗺️</Text>
            <Text style={styles.emptyText}>{t('noJourneysYet')}</Text>
            <Pressable style={styles.emptyBtn} onPress={openModePicker}>
              <Text style={styles.emptyBtnText}>{t('addTravelEntry')}</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.list}>
            {journeys.map((j, i) => {
              const cfg       = getModeConfig(j.travelMode);
              const icon      = j.travelMode ? cfg.icon : (j.isGps ? '📡' : '🚗');
              const modeLabel = j.travelMode ? cfg.label : (j.isGps ? 'GPS' : 'Car');
              return (
                <Pressable
                  key={j.id}
                  style={[styles.journeyRow, i > 0 && { borderTopWidth: 1, borderTopColor: COLORS.border }]}
                  onLongPress={() => deleteJourney(j.id)}
                >
                  <View style={styles.journeyIcon}>
                    <Text style={{ fontSize: 16 }}>{icon}</Text>
                  </View>
                  <View style={styles.journeyInfo}>
                    <Text style={styles.journeyRoute} numberOfLines={1}>{j.from} → {j.to}</Text>
                    <Text style={styles.journeyMeta}>{modeLabel} · {j.purpose} · {j.date}</Text>
                    {j.distanceKm > 0 && (
                      <Text style={styles.journeyKmTag}>{j.distanceKm.toFixed(2)} km</Text>
                    )}
                  </View>
                  <View style={styles.journeyRight}>
                    <Text style={styles.journeyDeductible}>{formatCurrency(j.deductible, currency)}</Text>
                    {j.isGps && (
                      <View style={styles.gpsBadge}>
                        <Text style={styles.gpsBadgeText}>GPS</Text>
                      </View>
                    )}
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}

        <Text style={styles.hint}>{t('longPressToDelete')}</Text>
        <Text style={styles.version}>◆ ScandiNordic Pro v.2</Text>
      </ScrollView>

      {/* ── Mode Picker Modal ──────────────────────────────────────────────── */}
      <Modal
        visible={showModePicker}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closePicker}
      >
        <View style={{ flex: 1, backgroundColor: COLORS.background }}>
          <View style={[styles.modalHeader, { paddingTop: insets.top + 16 }]}>
            {pickerStep === 'km-action' ? (
              <Pressable onPress={() => setPickerStep('select')} hitSlop={10}>
                <Feather name="arrow-left" size={20} color={COLORS.text} />
              </Pressable>
            ) : (
              <Pressable onPress={closePicker}>
                <Text style={styles.modalCancel}>{t('cancel')}</Text>
              </Pressable>
            )}
            <Text style={styles.modalTitle}>
              {pickerStep === 'km-action'
                ? `${activeModeConfig.icon} ${activeModeConfig.label}`
                : t('addTravelEntry')}
            </Text>
            <View style={{ width: 50 }} />
          </View>

          {pickerStep === 'select' ? (
            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
              <Text style={styles.pickerSection}>{t('kmBased')}</Text>
              <View style={styles.modeGrid}>
                {kmModes.map(cfg => (
                  <Pressable
                    key={cfg.id}
                    style={styles.modeCard}
                    onPress={() => onModeSelect(cfg)}
                  >
                    <Text style={styles.modeCardIcon}>{cfg.icon}</Text>
                    <Text style={styles.modeCardLabel}>{cfg.label}</Text>
                    <Text style={styles.modeCardRate}>{cfg.rateLabel}</Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.pickerSection}>{t('receiptBased')}</Text>
              <View style={styles.modeGrid}>
                {receiptModes.map(cfg => (
                  <Pressable
                    key={cfg.id}
                    style={styles.modeCard}
                    onPress={() => onModeSelect(cfg)}
                  >
                    <Text style={styles.modeCardIcon}>{cfg.icon}</Text>
                    <Text style={styles.modeCardLabel}>{cfg.label}</Text>
                    <Text style={styles.modeCardRate}>{cfg.rateLabel}</Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.pickerSection}>{t('allowance')}</Text>
              <View style={styles.modeGrid}>
                {allowModes.map(cfg => (
                  <Pressable
                    key={cfg.id}
                    style={[styles.modeCard, { borderColor: COLORS.warning + '50' }]}
                    onPress={() => onModeSelect(cfg)}
                  >
                    <Text style={styles.modeCardIcon}>{cfg.icon}</Text>
                    <Text style={styles.modeCardLabel}>{cfg.label}</Text>
                    <Text style={[styles.modeCardRate, { color: COLORS.warning }]}>{t('mealRatesHint')}</Text>
                  </Pressable>
                ))}
              </View>
              <View style={{ height: 40 }} />
            </ScrollView>
          ) : (
            /* KM action step — GPS or Manual */
            <View style={[styles.modalBody, { gap: 16, paddingTop: 28 }]}>
              <View style={styles.modeActionHero}>
                <Text style={styles.modeHeroIcon}>{activeModeConfig.icon}</Text>
                <Text style={styles.modeHeroTitle}>{activeModeConfig.label}</Text>
                <Text style={styles.modeHeroRate}>{activeModeConfig.rateLabel}</Text>
              </View>
              {Location ? (
                <Pressable
                  style={styles.primaryActionBtn}
                  onPress={() => { closePicker(); startGpsJourney(); }}
                >
                  <Feather name="navigation" size={18} color={COLORS.background} />
                  <Text style={styles.primaryActionLabel}>{t('startGpsTracking')}</Text>
                </Pressable>
              ) : null}
              <Pressable
                style={styles.secondaryActionBtn}
                onPress={() => {
                  closePicker();
                  setMDate(new Date().toISOString().split('T')[0]);
                  setShowKmForm(true);
                }}
              >
                <Feather name="edit-2" size={16} color={COLORS.primary} />
                <Text style={styles.secondaryActionLabel}>{t('enterManually')}</Text>
              </Pressable>
            </View>
          )}
        </View>
      </Modal>

      {/* ── Manual KM Form Modal ───────────────────────────────────────────── */}
      <Modal
        visible={showKmForm}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => { setShowKmForm(false); resetKmForm(); }}
      >
        <KeyboardAvoidingView
          style={{ flex: 1, backgroundColor: COLORS.background }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={[styles.modalHeader, { paddingTop: insets.top + 16 }]}>
            <Pressable onPress={() => { setShowKmForm(false); resetKmForm(); }}>
              <Text style={styles.modalCancel}>{t('cancel')}</Text>
            </Pressable>
            <Text style={styles.modalTitle}>{activeModeConfig.icon} {activeModeConfig.label}</Text>
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
                <TextInput
                  style={styles.input}
                  value={mKm}
                  onChangeText={setMKm}
                  placeholder="0.0"
                  placeholderTextColor={COLORS.muted}
                  keyboardType="decimal-pad"
                />
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
            <TextInput
              style={styles.input}
              value={mPurpose}
              onChangeText={setMPurpose}
              placeholder={t('purposePlaceholder')}
              placeholderTextColor={COLORS.muted}
            />
            {parseFloat(mKm) > 0 && (
              <View style={styles.deductPreview}>
                <Text style={styles.deductLabel}>{t('deductible')}</Text>
                <Text style={styles.deductValue}>
                  {formatCurrency(Math.round(parseFloat(mKm.replace(',', '.')) * (activeModeConfig.rate ?? 0.55) * 100) / 100, currency)}
                </Text>
              </View>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Receipt Form Modal ─────────────────────────────────────────────── */}
      <Modal
        visible={showReceiptForm}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => { setShowReceiptForm(false); resetReceiptForm(); }}
      >
        <KeyboardAvoidingView
          style={{ flex: 1, backgroundColor: COLORS.background }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={[styles.modalHeader, { paddingTop: insets.top + 16 }]}>
            <Pressable onPress={() => { setShowReceiptForm(false); resetReceiptForm(); }}>
              <Text style={styles.modalCancel}>{t('cancel')}</Text>
            </Pressable>
            <Text style={styles.modalTitle}>{activeModeConfig.icon} {activeModeConfig.label}</Text>
            <Pressable onPress={saveReceiptJourney}>
              <Text style={styles.modalSave}>{t('save')}</Text>
            </Pressable>
          </View>
          <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled">
            <View style={styles.twoCol}>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>{t('from')}</Text>
                <TextInput style={styles.input} value={rFrom} onChangeText={setRFrom} placeholder="Helsinki" placeholderTextColor={COLORS.muted} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>{t('to')}</Text>
                <TextInput style={styles.input} value={rTo} onChangeText={setRTo} placeholder="Vantaa" placeholderTextColor={COLORS.muted} />
              </View>
            </View>
            <View style={styles.twoCol}>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>{t('receiptAmount')}</Text>
                <TextInput
                  style={styles.input}
                  value={rAmount}
                  onChangeText={setRAmount}
                  placeholder="0.00"
                  placeholderTextColor={COLORS.muted}
                  keyboardType="decimal-pad"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>{t('date')}</Text>
                <Pressable style={[styles.input, { justifyContent: 'center' }]} onPress={() => setShowRDatePicker(true)}>
                  <Text style={{ color: COLORS.text, fontSize: 13 }}>{rDate}</Text>
                </Pressable>
                <DatePickerModal
                  visible={showRDatePicker}
                  value={rDate}
                  onConfirm={d => { setRDate(d); setShowRDatePicker(false); }}
                  onCancel={() => setShowRDatePicker(false)}
                  title={t('date')}
                />
              </View>
            </View>
            <Text style={styles.fieldLabel}>{t('notes')}</Text>
            <TextInput
              style={[styles.input, { height: 80, paddingTop: 12, textAlignVertical: 'top' }]}
              value={rNotes}
              onChangeText={setRNotes}
              placeholder={t('notesOptional')}
              placeholderTextColor={COLORS.muted}
              multiline
            />
            {rAmount && parseFloat(rAmount.replace(',', '.')) > 0 && (
              <View style={styles.deductPreview}>
                <Text style={styles.deductLabel}>{t('reimbursement')}</Text>
                <Text style={styles.deductValue}>
                  {formatCurrency(parseFloat(rAmount.replace(',', '.')), currency)}
                </Text>
              </View>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Meal Allowance Modal ───────────────────────────────────────────── */}
      <Modal
        visible={showMealForm}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => { setShowMealForm(false); resetMealForm(); }}
      >
        <KeyboardAvoidingView
          style={{ flex: 1, backgroundColor: COLORS.background }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={[styles.modalHeader, { paddingTop: insets.top + 16 }]}>
            <Pressable onPress={() => { setShowMealForm(false); resetMealForm(); }}>
              <Text style={styles.modalCancel}>{t('cancel')}</Text>
            </Pressable>
            <Text style={styles.modalTitle}>🍽️ {t('mealAllowance')}</Text>
            <Pressable onPress={saveMealAllowance}>
              <Text style={styles.modalSave}>{t('save')}</Text>
            </Pressable>
          </View>
          <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled">
            <View style={styles.mealInfoBox}>
              <Text style={styles.mealInfoRow}>🕐  6h+ → {formatCurrency(MEAL_RATES.sixHour, currency)}</Text>
              <Text style={styles.mealInfoRow}>🕙 10h+ → {formatCurrency(MEAL_RATES.tenHour, currency)}</Text>
            </View>
            <View style={styles.twoCol}>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>{t('hoursAway')}</Text>
                <TextInput
                  style={styles.input}
                  value={mealHours}
                  onChangeText={setMealHours}
                  placeholder="8.5"
                  placeholderTextColor={COLORS.muted}
                  keyboardType="decimal-pad"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>{t('date')}</Text>
                <Pressable style={[styles.input, { justifyContent: 'center' }]} onPress={() => setShowMealDatePicker(true)}>
                  <Text style={{ color: COLORS.text, fontSize: 13 }}>{mealDate}</Text>
                </Pressable>
                <DatePickerModal
                  visible={showMealDatePicker}
                  value={mealDate}
                  onConfirm={d => { setMealDate(d); setShowMealDatePicker(false); }}
                  onCancel={() => setShowMealDatePicker(false)}
                  title={t('date')}
                />
              </View>
            </View>
            <Text style={styles.fieldLabel}>{t('notes')}</Text>
            <TextInput
              style={[styles.input, { height: 80, paddingTop: 12, textAlignVertical: 'top' }]}
              value={mealNotes}
              onChangeText={setMealNotes}
              placeholder={t('notesOptional')}
              placeholderTextColor={COLORS.muted}
              multiline
            />
            {mealPreview && (
              mealPreview.isZero ? (
                <View style={[styles.deductPreview, { backgroundColor: COLORS.warningDim, borderColor: COLORS.warning + '30' }]}>
                  <Text style={[styles.deductLabel, { color: COLORS.warning }]}>{t('mealUnder6h')}</Text>
                </View>
              ) : (
                <View style={styles.deductPreview}>
                  <Text style={styles.deductLabel}>{t('allowance')}</Text>
                  <Text style={styles.deductValue}>{formatCurrency(mealPreview.allowance, currency)}</Text>
                </View>
              )
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {dialog}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const makeStyles = () => StyleSheet.create({
  content: { paddingHorizontal: 20, gap: 12 },

  back:     { flexDirection: 'row', alignItems: 'center', gap: 6 },
  backText: { fontSize: 14, color: COLORS.primary, fontWeight: '500' },
  badge:    { fontSize: 9, color: COLORS.primary, letterSpacing: 4, textTransform: 'uppercase' },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  title:    { fontSize: 24, fontWeight: '700', color: COLORS.text, letterSpacing: -0.5 },
  addBtn:   { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.primaryDim, borderWidth: 1, borderColor: COLORS.primary + '40' },
  divider:  { height: 1, backgroundColor: COLORS.border },

  gpsError: { fontSize: 11, color: COLORS.warning, backgroundColor: COLORS.warningDim, borderRadius: 10, padding: 10, borderWidth: 1, borderColor: COLORS.warning + '40' },

  // Tracking card
  trackingCard:       { backgroundColor: COLORS.card, borderRadius: 16, borderWidth: 1, borderColor: COLORS.danger + '50', padding: 16, gap: 14 },
  trackingHeader:     { flexDirection: 'row', alignItems: 'center', gap: 8 },
  trackingDot:        { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.danger },
  trackingTitle:      { fontSize: 12, fontWeight: '700', color: COLORS.danger, textTransform: 'uppercase', letterSpacing: 1 },
  trackingModeBadge:  { marginLeft: 'auto' as any, backgroundColor: COLORS.primaryDim, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: COLORS.primary + '30' },
  trackingModeText:   { fontSize: 11, color: COLORS.primary, fontWeight: '600' },
  trackingStats:      { flexDirection: 'row', gap: 8 },
  trackingStat:       { flex: 1, alignItems: 'center', backgroundColor: COLORS.surface, borderRadius: 10, paddingVertical: 10, gap: 2 },
  trackingStatVal:    { fontSize: 15, fontWeight: '700', color: COLORS.text },
  trackingStatLabel:  { fontSize: 9, color: COLORS.muted, textTransform: 'uppercase', letterSpacing: 0.5 },
  trackingInput:      { backgroundColor: COLORS.input, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, color: COLORS.text, fontSize: 13, paddingHorizontal: 12, paddingVertical: 10 },
  stopBtn:            { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: COLORS.danger, borderRadius: 12, paddingVertical: 14 },
  stopBtnText:        { fontSize: 13, fontWeight: '700', color: COLORS.background, textTransform: 'uppercase', letterSpacing: 1 },

  // Add entry hint (when not tracking)
  addEntryHint:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: COLORS.primaryDim, borderRadius: 14, paddingVertical: 16, borderWidth: 1, borderColor: COLORS.primary + '40' },
  addEntryHintText: { fontSize: 14, fontWeight: '600', color: COLORS.primary, letterSpacing: 0.3 },

  // Summary
  summaryRow:   { flexDirection: 'row', gap: 8 },
  summaryCard:  { flex: 1, backgroundColor: COLORS.card, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, padding: 12, gap: 4 },
  summaryLabel: { fontSize: 9, color: COLORS.muted, textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: '600' },
  summaryValue: { fontSize: 14, fontWeight: '700' },

  // Category breakdown
  breakdownCard:   { backgroundColor: COLORS.card, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, padding: 14, gap: 10 },
  breakdownTitle:  { fontSize: 10, fontWeight: '700', color: COLORS.muted, textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 2 },
  breakdownRow:    { flexDirection: 'row', alignItems: 'center', gap: 8 },
  breakdownIcon:   { fontSize: 14, width: 22 },
  breakdownLabel:  { flex: 1, fontSize: 13, color: COLORS.text },
  breakdownAmount: { fontSize: 13, fontWeight: '700', color: COLORS.success },

  sectionLabel: { fontSize: 10, color: COLORS.muted, textTransform: 'uppercase', letterSpacing: 1.5, fontWeight: '600' },

  // Journey list
  list:            { backgroundColor: COLORS.card, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden' },
  journeyRow:      { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 },
  journeyIcon:     { width: 36, height: 36, borderRadius: 10, backgroundColor: COLORS.primaryDim, alignItems: 'center', justifyContent: 'center' },
  journeyInfo:     { flex: 1, gap: 2 },
  journeyRoute:    { fontSize: 13, fontWeight: '600', color: COLORS.text },
  journeyMeta:     { fontSize: 10, color: COLORS.muted },
  journeyKmTag:    { fontSize: 10, color: COLORS.primary, fontWeight: '600' },
  journeyRight:    { alignItems: 'flex-end', gap: 4 },
  journeyDeductible: { fontSize: 13, fontWeight: '700', color: COLORS.success },
  gpsBadge:        { backgroundColor: COLORS.primaryDim, borderRadius: 5, paddingHorizontal: 5, paddingVertical: 2, borderWidth: 1, borderColor: COLORS.primary + '30' },
  gpsBadgeText:    { fontSize: 9, color: COLORS.primary, fontWeight: '700', letterSpacing: 0.5 },

  empty:        { alignItems: 'center', paddingTop: 40, gap: 10 },
  emptyIcon:    { fontSize: 36 },
  emptyText:    { fontSize: 14, color: COLORS.muted },
  emptyBtn:     { backgroundColor: COLORS.primaryDim, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20, borderWidth: 1, borderColor: COLORS.primary + '40' },
  emptyBtnText: { fontSize: 13, fontWeight: '600', color: COLORS.primary },

  hint:    { fontSize: 10, color: COLORS.muted + '80', textAlign: 'center' },
  version: { textAlign: 'center', fontSize: 9, color: COLORS.muted + '60', letterSpacing: 4, marginTop: 8 },

  // Modal shared
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  modalTitle:  { fontSize: 16, fontWeight: '600', color: COLORS.text },
  modalCancel: { fontSize: 15, color: COLORS.textSecondary, minWidth: 50 },
  modalSave:   { fontSize: 15, fontWeight: '600', color: COLORS.primary, minWidth: 50, textAlign: 'right' },
  modalBody:   { padding: 20 },
  twoCol:      { flexDirection: 'row', gap: 10, marginBottom: 14 },
  fieldLabel:  { fontSize: 10, fontWeight: '600', color: COLORS.muted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 },
  input:       { backgroundColor: COLORS.card, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, color: COLORS.text, fontSize: 14, paddingHorizontal: 14, height: 48 },
  deductPreview: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: COLORS.successDim, borderRadius: 10, borderWidth: 1, borderColor: COLORS.success + '30', paddingHorizontal: 14, paddingVertical: 10, marginTop: 8 },
  deductLabel:   { fontSize: 12, color: COLORS.success },
  deductValue:   { fontSize: 15, fontWeight: '700', color: COLORS.success },

  // Mode picker
  pickerSection: { fontSize: 10, fontWeight: '700', color: COLORS.muted, textTransform: 'uppercase', letterSpacing: 1.5, marginTop: 18, marginBottom: 10 },
  modeGrid:      { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  modeCard:      { width: '47%', backgroundColor: COLORS.card, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, padding: 14, gap: 4 },
  modeCardIcon:  { fontSize: 22 },
  modeCardLabel: { fontSize: 13, fontWeight: '600', color: COLORS.text },
  modeCardRate:  { fontSize: 10, color: COLORS.primary, fontWeight: '600' },

  // KM action step
  modeActionHero: { alignItems: 'center', gap: 8, paddingVertical: 24, backgroundColor: COLORS.card, borderRadius: 18, borderWidth: 1, borderColor: COLORS.border },
  modeHeroIcon:   { fontSize: 52 },
  modeHeroTitle:  { fontSize: 22, fontWeight: '700', color: COLORS.text },
  modeHeroRate:   { fontSize: 14, color: COLORS.primary, fontWeight: '600' },
  primaryActionBtn:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: COLORS.primary, borderRadius: 14, paddingVertical: 16 },
  primaryActionLabel: { fontSize: 14, fontWeight: '700', color: COLORS.background, textTransform: 'uppercase', letterSpacing: 1 },
  secondaryActionBtn:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: COLORS.primaryDim, borderRadius: 14, paddingVertical: 16, borderWidth: 1, borderColor: COLORS.primary + '40' },
  secondaryActionLabel: { fontSize: 14, fontWeight: '600', color: COLORS.primary, letterSpacing: 0.3 },

  // Meal allowance
  mealInfoBox: { backgroundColor: COLORS.warningDim, borderRadius: 12, borderWidth: 1, borderColor: COLORS.warning + '40', padding: 14, gap: 6, marginBottom: 14 },
  mealInfoRow: { fontSize: 13, color: COLORS.warning, fontWeight: '600' },
});
