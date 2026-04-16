import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { COLORS } from '@/constants/colors';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAppDialog } from '@/components/AppDialog';
import {
  getWorkers, saveWorker, deleteWorker,
  getWorkSessions, saveWorkSession, getSettings,
} from '@/lib/storage';
import { businessCategories, getCategoryLabel } from '@/lib/categories';
import { formatCurrency } from '@/lib/currency';
import type { Worker, WorkSession, Currency } from '@/lib/types';

function formatElapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) {
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function startOfMonth(): Date {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export default function TeamScreen() {
  const styles = makeStyles();
  const insets = useSafeAreaInsets();
  const { t, language } = useLanguage();
  const { show: showDialog, dialog } = useAppDialog();

  const [workers, setWorkers] = useState<Worker[]>([]);
  const [sessions, setSessions] = useState<WorkSession[]>([]);
  const [currency, setCurrency] = useState<Currency>('EUR');

  // Timer
  const [activeWorkerId, setActiveWorkerId] = useState<string | null>(null);
  const [timerStart, setTimerStart] = useState<Date | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [timerNote, setTimerNote] = useState('');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Add worker modal
  const [showAddWorker, setShowAddWorker] = useState(false);
  const [workerName, setWorkerName] = useState('');
  const [workerRate, setWorkerRate] = useState('');
  const [workerCategory, setWorkerCategory] = useState('');
  const [categorySearch, setCategorySearch] = useState('');
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);

  // Start timer modal
  const [showStartTimer, setShowStartTimer] = useState(false);
  const [selectedWorkerForTimer, setSelectedWorkerForTimer] = useState('');
  const [pendingNote, setPendingNote] = useState('');

  const load = useCallback(async () => {
    const [w, s, settings] = await Promise.all([getWorkers(), getWorkSessions(), getSettings()]);
    setWorkers(w);
    setSessions(s);
    setCurrency(settings.currency);
  }, []);

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (activeWorkerId && timerStart) {
      timerRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - timerStart.getTime()) / 1000));
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      setElapsed(0);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [activeWorkerId, timerStart]);

  const monthStart = startOfMonth();

  const workerStats = useMemo(() => workers.map(w => {
    const monthSessions = sessions.filter(s => s.workerId === w.id && new Date(s.date) >= monthStart && s.durationHours != null);
    const monthHours = monthSessions.reduce((sum, s) => sum + (s.durationHours ?? 0), 0);
    return { ...w, monthHours, estSalary: monthHours * w.hourlyRate };
  }), [workers, sessions]);

  const recentSessions = useMemo(() =>
    [...sessions].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 8),
    [sessions]
  );

  const activeWorker = workers.find(w => w.id === activeWorkerId);

  async function handleStartTimer() {
    if (!selectedWorkerForTimer) return;
    setShowStartTimer(false);
    setActiveWorkerId(selectedWorkerForTimer);
    setTimerStart(new Date());
    setTimerNote(pendingNote);
    setPendingNote('');
    setSelectedWorkerForTimer('');
  }

  async function handleStopTimer() {
    if (!activeWorkerId || !timerStart) return;
    const endTime = new Date();
    const durationHours = (endTime.getTime() - timerStart.getTime()) / 3600000;
    await saveWorkSession({
      id: Date.now().toString(),
      workerId: activeWorkerId,
      startTime: timerStart.toISOString(),
      endTime: endTime.toISOString(),
      durationHours,
      note: timerNote || undefined,
      date: endTime.toISOString().split('T')[0],
    });
    setActiveWorkerId(null);
    setTimerStart(null);
    setTimerNote('');
    await load();
  }

  async function handleAddWorker() {
    if (!workerName.trim() || !workerRate || !workerCategory) return;
    await saveWorker({
      id: Date.now().toString(),
      name: workerName.trim(),
      categoryId: workerCategory,
      hourlyRate: parseFloat(workerRate),
      createdAt: new Date().toISOString(),
    });
    setWorkerName(''); setWorkerRate(''); setWorkerCategory('');
    setShowAddWorker(false);
    await load();
  }

  async function handleDeleteWorker(id: string) {
    const idx = await showDialog(t('delete'), t('removeThisWorker'), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('delete'), style: 'destructive' },
    ]);
    if (idx === 1) { await deleteWorker(id); await load(); }
  }

  const filteredCategories = useMemo(() => {
    if (!categorySearch) return businessCategories;
    const q = categorySearch.toLowerCase();
    return businessCategories.filter(c =>
      (c.labels[language] ?? c.labels.en).toLowerCase().includes(q)
    );
  }, [categorySearch, language]);

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 110 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <Text style={styles.badge}>◆ ScandiNordic Pro ◆</Text>
        <View style={styles.headerRow}>
          <Text style={styles.title}>{t('team')}</Text>
          <Pressable style={styles.addBtn} onPress={() => setShowAddWorker(true)}>
            <Feather name="plus" size={15} color={COLORS.background} />
            <Text style={styles.addBtnText}>{t('addWorker')}</Text>
          </Pressable>
        </View>
        <View style={styles.divider} />

        {/* Timer Card */}
        {activeWorkerId ? (
          <View style={[styles.timerCard, styles.timerCardActive]}>
            <View style={styles.timerPulseRow}>
              <View style={styles.timerDot} />
              <Text style={styles.timerActiveLabel}>{t('timerRunning')} — {activeWorker?.name}</Text>
            </View>
            <Text style={styles.timerElapsed}>{formatElapsed(elapsed)}</Text>
            {timerNote ? <Text style={styles.timerNote}>{timerNote}</Text> : null}
            <Pressable style={styles.stopBtn} onPress={handleStopTimer}>
              <Feather name="square" size={13} color={COLORS.danger} />
              <Text style={styles.stopBtnText}>{t('stopTimer')}</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable
            style={styles.startTimerCard}
            onPress={() => {
              if (workers.length === 0) {
                Alert.alert('No Workers', 'Add a worker first before starting a timer.');
                return;
              }
              setShowStartTimer(true);
            }}
          >
            <View style={styles.startTimerIconBox}>
              <Feather name="play" size={18} color={COLORS.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.startTimerTitle}>{t('startTimer')}</Text>
              <Text style={styles.startTimerSub}>Track work time for a team member</Text>
            </View>
            <Feather name="chevron-right" size={16} color={COLORS.muted} />
          </Pressable>
        )}

        {/* Workers */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{t('workers')}</Text>
          {workers.length > 0 && <Text style={styles.sectionCount}>{workers.length}</Text>}
        </View>

        {workers.length === 0 ? (
          <View style={styles.emptyCard}>
            <Feather name="users" size={32} color={COLORS.muted} />
            <Text style={styles.emptyTitle}>{t('noWorkers')}</Text>
            <Text style={styles.emptyDesc}>{t('addFirstWorker')}</Text>
            <Pressable style={styles.emptyAddBtn} onPress={() => setShowAddWorker(true)}>
              <Text style={styles.emptyAddBtnText}>{t('addWorker')}</Text>
            </Pressable>
          </View>
        ) : (
          workerStats.map(w => (
            <View key={w.id} style={styles.workerCard}>
              <View style={styles.workerAvatar}>
                <Text style={styles.workerAvatarText}>{w.name.charAt(0).toUpperCase()}</Text>
              </View>
              <View style={styles.workerBody}>
                <View style={styles.workerTop}>
                  <Text style={styles.workerName}>{w.name}</Text>
                  <Pressable onPress={() => handleDeleteWorker(w.id)} hitSlop={12}>
                    <Feather name="trash-2" size={14} color={COLORS.muted} />
                  </Pressable>
                </View>
                <Text style={styles.workerCategory}>{getCategoryLabel(w.categoryId, language)}</Text>
                <View style={styles.workerStats}>
                  <View style={styles.workerStat}>
                    <Text style={styles.workerStatLabel}>{t('monthlyHours')}</Text>
                    <Text style={styles.workerStatValue}>{w.monthHours.toFixed(1)}h</Text>
                  </View>
                  <View style={styles.workerStat}>
                    <Text style={styles.workerStatLabel}>{t('estimatedSalary')}</Text>
                    <Text style={[styles.workerStatValue, { color: COLORS.success }]}>{formatCurrency(w.estSalary, currency)}</Text>
                  </View>
                  <View style={styles.workerStat}>
                    <Text style={styles.workerStatLabel}>{t('hourlyRate')}</Text>
                    <Text style={styles.workerStatValue}>{formatCurrency(w.hourlyRate, currency)}/h</Text>
                  </View>
                </View>
              </View>
            </View>
          ))
        )}

        {/* Recent Sessions */}
        {recentSessions.length > 0 && (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{t('recentSessions')}</Text>
            </View>
            <View style={styles.card}>
              {recentSessions.map((s, i) => {
                const w = workers.find(w => w.id === s.workerId);
                const date = new Date(s.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
                return (
                  <View key={s.id} style={[styles.sessionRow, i === 0 && { borderTopWidth: 0, paddingTop: 0 }]}>
                    <View style={styles.sessionIcon}>
                      <Feather name="clock" size={12} color={COLORS.primary} />
                    </View>
                    <View style={styles.sessionInfo}>
                      <Text style={styles.sessionWorker}>{w?.name ?? '—'}</Text>
                      <Text style={styles.sessionMeta}>{date}{s.note ? ` · ${s.note}` : ''}</Text>
                    </View>
                    <Text style={styles.sessionHours}>{(s.durationHours ?? 0).toFixed(2)}h</Text>
                  </View>
                );
              })}
            </View>
          </>
        )}
      </ScrollView>

      {/* Add Worker Modal */}
      <Modal visible={showAddWorker} animationType="slide" presentationStyle="pageSheet">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: COLORS.background }}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{t('addWorker')}</Text>
            <Pressable onPress={() => { setShowAddWorker(false); setWorkerName(''); setWorkerRate(''); setWorkerCategory(''); }}>
              <Feather name="x" size={22} color={COLORS.text} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.modalContent}>
            <Text style={styles.fieldLabel}>{t('workerName')}</Text>
            <TextInput style={styles.input} value={workerName} onChangeText={setWorkerName} placeholder="e.g. Mikael Virtanen" placeholderTextColor={COLORS.muted} autoFocus />

            <Text style={[styles.fieldLabel, { marginTop: 16 }]}>{t('selectCategory')}</Text>
            <Pressable style={styles.pickerBtn} onPress={() => setShowCategoryPicker(true)}>
              <Text style={[styles.pickerBtnText, !workerCategory && { color: COLORS.muted }]}>
                {workerCategory ? getCategoryLabel(workerCategory, language) : t('selectCategory')}
              </Text>
              <Feather name="chevron-down" size={16} color={COLORS.muted} />
            </Pressable>

            <Text style={[styles.fieldLabel, { marginTop: 16 }]}>{t('hourlyRate')} ({currency})</Text>
            <TextInput style={styles.input} value={workerRate} onChangeText={setWorkerRate} placeholder="0.00" placeholderTextColor={COLORS.muted} keyboardType="decimal-pad" />

            <Pressable
              style={[styles.saveBtn, (!workerName.trim() || !workerRate || !workerCategory) && { opacity: 0.4 }]}
              onPress={handleAddWorker}
              disabled={!workerName.trim() || !workerRate || !workerCategory}
            >
              <Text style={styles.saveBtnText}>{t('save')}</Text>
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* Category Picker Modal */}
      <Modal visible={showCategoryPicker} animationType="slide" presentationStyle="pageSheet">
        <View style={{ flex: 1, backgroundColor: COLORS.background }}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{t('selectCategory')}</Text>
            <Pressable onPress={() => { setShowCategoryPicker(false); setCategorySearch(''); }}>
              <Feather name="x" size={22} color={COLORS.text} />
            </Pressable>
          </View>
          <View style={styles.searchBox}>
            <Feather name="search" size={14} color={COLORS.muted} />
            <TextInput style={styles.searchInput} value={categorySearch} onChangeText={setCategorySearch} placeholder={t('searchCategories')} placeholderTextColor={COLORS.muted} autoFocus />
          </View>
          <FlatList
            data={filteredCategories}
            keyExtractor={c => c.id}
            contentContainerStyle={{ padding: 16, gap: 6 }}
            renderItem={({ item }) => (
              <Pressable
                style={[styles.catRow, workerCategory === item.id && styles.catRowActive]}
                onPress={() => { setWorkerCategory(item.id); setShowCategoryPicker(false); setCategorySearch(''); }}
              >
                <Text style={[styles.catRowText, workerCategory === item.id && { color: COLORS.primary }]}>
                  {getCategoryLabel(item.id, language)}
                </Text>
                {workerCategory === item.id && <Feather name="check" size={14} color={COLORS.primary} />}
              </Pressable>
            )}
          />
        </View>
      </Modal>

      {/* Start Timer Modal */}
      <Modal visible={showStartTimer} animationType="slide" presentationStyle="pageSheet">
        <View style={{ flex: 1, backgroundColor: COLORS.background }}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{t('startTimer')}</Text>
            <Pressable onPress={() => { setShowStartTimer(false); setSelectedWorkerForTimer(''); setPendingNote(''); }}>
              <Feather name="x" size={22} color={COLORS.text} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.modalContent}>
            <Text style={styles.fieldLabel}>{t('selectWorker')}</Text>
            {workers.map(w => (
              <Pressable
                key={w.id}
                style={[styles.catRow, selectedWorkerForTimer === w.id && styles.catRowActive]}
                onPress={() => setSelectedWorkerForTimer(w.id)}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.catRowText, selectedWorkerForTimer === w.id && { color: COLORS.primary }]}>{w.name}</Text>
                  <Text style={styles.workerCategory}>{getCategoryLabel(w.categoryId, language)}</Text>
                </View>
                {selectedWorkerForTimer === w.id && <Feather name="check" size={14} color={COLORS.primary} />}
              </Pressable>
            ))}

            <Text style={[styles.fieldLabel, { marginTop: 16 }]}>{t('sessionNote')}</Text>
            <TextInput style={styles.input} value={pendingNote} onChangeText={setPendingNote} placeholder="What are they working on?" placeholderTextColor={COLORS.muted} />

            <Pressable
              style={[styles.saveBtn, { backgroundColor: COLORS.success }, !selectedWorkerForTimer && { opacity: 0.4 }]}
              onPress={handleStartTimer}
              disabled={!selectedWorkerForTimer}
            >
              <Feather name="play" size={14} color={COLORS.background} />
              <Text style={styles.saveBtnText}>{t('startTimer')}</Text>
            </Pressable>
          </ScrollView>
        </View>
      </Modal>
      {dialog}
    </View>
  );
}

const makeStyles = () => StyleSheet.create({
  content: { paddingHorizontal: 16, gap: 12 },

  badge: { fontSize: 9, color: COLORS.primary, letterSpacing: 4, textTransform: 'uppercase' },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  title: { fontSize: 30, fontWeight: '700', color: COLORS.text, letterSpacing: -0.5 },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: COLORS.primary, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 99 },
  addBtnText: { fontSize: 12, fontWeight: '600', color: COLORS.background },
  divider: { height: 1, backgroundColor: COLORS.border },

  // Timer — active
  timerCard: { backgroundColor: COLORS.card, borderRadius: 18, padding: 20, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', gap: 8 },
  timerCardActive: { borderColor: COLORS.success + '50', backgroundColor: COLORS.card },
  timerPulseRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  timerDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.success },
  timerActiveLabel: { fontSize: 11, color: COLORS.success, textTransform: 'uppercase', letterSpacing: 1, fontWeight: '600' },
  timerElapsed: { fontSize: 48, fontWeight: '700', color: COLORS.text, letterSpacing: -1.5, fontVariant: ['tabular-nums'] as any },
  timerNote: { fontSize: 12, color: COLORS.muted, fontStyle: 'italic' },
  stopBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4, backgroundColor: COLORS.dangerDim, paddingHorizontal: 16, paddingVertical: 9, borderRadius: 99 },
  stopBtnText: { fontSize: 12, fontWeight: '600', color: COLORS.danger },

  // Timer — idle
  startTimerCard: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: COLORS.card, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: COLORS.border },
  startTimerIconBox: { width: 42, height: 42, borderRadius: 12, backgroundColor: COLORS.primary + '18', alignItems: 'center', justifyContent: 'center' },
  startTimerTitle: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  startTimerSub: { fontSize: 11, color: COLORS.muted, marginTop: 2 },

  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitle: { fontSize: 10, color: COLORS.textSecondary, textTransform: 'uppercase', letterSpacing: 1.5, fontWeight: '600' },
  sectionCount: { fontSize: 10, color: COLORS.primary, fontWeight: '700' },

  emptyCard: { backgroundColor: COLORS.card, borderRadius: 16, padding: 32, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', gap: 8 },
  emptyTitle: { fontSize: 15, fontWeight: '600', color: COLORS.text, marginTop: 8 },
  emptyDesc: { fontSize: 12, color: COLORS.muted, textAlign: 'center' },
  emptyAddBtn: { marginTop: 8, backgroundColor: COLORS.primary, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 99 },
  emptyAddBtnText: { fontSize: 13, fontWeight: '600', color: COLORS.background },

  workerCard: { backgroundColor: COLORS.card, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: COLORS.border, flexDirection: 'row', gap: 12 },
  workerAvatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: COLORS.primary + '20', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  workerAvatarText: { fontSize: 16, fontWeight: '700', color: COLORS.primary },
  workerBody: { flex: 1, gap: 4 },
  workerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  workerName: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  workerCategory: { fontSize: 11, color: COLORS.muted },
  workerStats: { flexDirection: 'row', gap: 16, marginTop: 6, flexWrap: 'wrap' },
  workerStat: { gap: 2 },
  workerStatLabel: { fontSize: 9, color: COLORS.muted, textTransform: 'uppercase', letterSpacing: 0.8 },
  workerStatValue: { fontSize: 13, fontWeight: '600', color: COLORS.text },

  card: { backgroundColor: COLORS.card, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, padding: 14 },
  sessionRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: COLORS.border },
  sessionIcon: { width: 28, height: 28, borderRadius: 8, backgroundColor: COLORS.primary + '18', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  sessionInfo: { flex: 1, gap: 2 },
  sessionWorker: { fontSize: 13, fontWeight: '500', color: COLORS.text },
  sessionMeta: { fontSize: 10, color: COLORS.muted },
  sessionHours: { fontSize: 13, fontWeight: '700', color: COLORS.primary },

  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingTop: Platform.OS === 'ios' ? 56 : 20, borderBottomWidth: 1, borderBottomColor: COLORS.border, backgroundColor: COLORS.background },
  modalTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text },
  modalContent: { padding: 20, paddingBottom: 60 },

  fieldLabel: { fontSize: 10, color: COLORS.muted, textTransform: 'uppercase', letterSpacing: 1, fontWeight: '600', marginBottom: 8 },
  input: { backgroundColor: COLORS.input, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: COLORS.border, fontSize: 15, color: COLORS.text },
  pickerBtn: { backgroundColor: COLORS.input, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: COLORS.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pickerBtnText: { fontSize: 15, color: COLORS.text },
  saveBtn: { backgroundColor: COLORS.primary, borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 24, flexDirection: 'row', justifyContent: 'center', gap: 8 },
  saveBtnText: { fontSize: 15, fontWeight: '700', color: COLORS.background },

  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 10, margin: 16, marginBottom: 8, backgroundColor: COLORS.input, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: COLORS.border },
  searchInput: { flex: 1, fontSize: 14, color: COLORS.text },
  catRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: COLORS.card, borderRadius: 10, padding: 14, borderWidth: 1, borderColor: COLORS.border, marginBottom: 6 },
  catRowActive: { borderColor: COLORS.primary + '60', backgroundColor: COLORS.primary + '10' },
  catRowText: { fontSize: 14, color: COLORS.text, fontWeight: '500' },
});
