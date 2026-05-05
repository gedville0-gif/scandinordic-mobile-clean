import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
import { useAuth } from '@/contexts/AuthContext';
import { useAppDialog } from '@/components/AppDialog';
import {
  getWorkers, saveWorker, deleteWorker,
  getWorkSessions, saveWorkSession, getSettings,
} from '@/lib/storage';
import { businessCategories, getCategoryLabel } from '@/lib/categories';
import { formatCurrency } from '@/lib/currency';
import type { Worker, WorkSession, Currency } from '@/lib/types';
import { supabase } from '@/lib/supabase';

// ─── Payroll types ────────────────────────────────────────────────────────────

interface PayrollEmployee {
  id: string;
  name: string;
  role: string;
  gross_salary: number;
  hours_per_month: number;
  tax_rate_override: number | null;
}

interface PayrollCalc {
  gross: number;
  tyel: number;
  tvr: number;
  sv: number;
  totalEmpDed: number;
  taxableIncome: number;
  incomeTax: number;
  netPay: number;
  erTyel: number;
  erTvr: number;
  erSv: number;
  totalErCost: number;
  effectiveTaxRate: number;
}

// ─── Finnish 2025 payroll rates ───────────────────────────────────────────────

const TYEL_EMP = 0.0745;  // Employee pension
const TVR_EMP  = 0.0079;  // Employee unemployment
const SV_EMP   = 0.0153;  // Employee health

const TYEL_ER  = 0.1734;  // Employer pension
const TVR_ER   = 0.0132;  // Employer unemployment
const SV_ER    = 0.0153;  // Employer health

const PAYROLL_BRACKETS = [
  { max: 19900,    rate: 0.1264 },
  { max: 29700,    rate: 0.19   },
  { max: 49000,    rate: 0.3025 },
  { max: 85800,    rate: 0.34   },
  { max: Infinity, rate: 0.44   },
];

function progressiveTaxMonthly(annualTaxable: number): number {
  let tax = 0, prev = 0;
  for (const b of PAYROLL_BRACKETS) {
    if (annualTaxable <= prev) break;
    tax += (Math.min(annualTaxable, b.max) - prev) * b.rate;
    prev = b.max;
  }
  return tax / 12;
}

function calcPayroll(emp: PayrollEmployee): PayrollCalc {
  const gross = emp.gross_salary;
  const tyel  = gross * TYEL_EMP;
  const tvr   = gross * TVR_EMP;
  const sv    = gross * SV_EMP;
  const totalEmpDed = tyel + tvr + sv;
  const taxableIncome = gross - totalEmpDed;

  let incomeTax: number;
  let effectiveTaxRate: number;
  if (emp.tax_rate_override !== null && emp.tax_rate_override !== undefined) {
    effectiveTaxRate = emp.tax_rate_override / 100;
    incomeTax = taxableIncome * effectiveTaxRate;
  } else {
    incomeTax = progressiveTaxMonthly(taxableIncome * 12);
    effectiveTaxRate = taxableIncome > 0 ? incomeTax / taxableIncome : 0;
  }

  const netPay    = taxableIncome - incomeTax;
  const erTyel    = gross * TYEL_ER;
  const erTvr     = gross * TVR_ER;
  const erSv      = gross * SV_ER;
  const totalErCost = gross + erTyel + erTvr + erSv;

  return { gross, tyel, tvr, sv, totalEmpDed, taxableIncome, incomeTax, netPay, erTyel, erTvr, erSv, totalErCost, effectiveTaxRate };
}

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
  const { session } = useAuth();
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

  // Tab
  const [activeTab, setActiveTab] = useState<'team' | 'payroll'>('team');

  // Payroll
  const [payrollEmployees, setPayrollEmployees] = useState<PayrollEmployee[]>([]);
  const [payrollLoading, setPayrollLoading] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<PayrollEmployee | null>(null);
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [showAddEmployee, setShowAddEmployee] = useState(false);
  const [editEmployee, setEditEmployee] = useState<PayrollEmployee | null>(null);
  const [empName, setEmpName] = useState('');
  const [empRole, setEmpRole] = useState('');
  const [empGross, setEmpGross] = useState('');
  const [empHours, setEmpHours] = useState('160');
  const [empTaxOverride, setEmpTaxOverride] = useState('');
  const [empSaveError, setEmpSaveError] = useState<string | null>(null);

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
    if (idx === 1) {
      if (activeWorkerId === id) {
        if (timerRef.current) clearInterval(timerRef.current);
        timerRef.current = null;
        setActiveWorkerId(null);
        setTimerStart(null);
        setElapsed(0);
        setTimerNote('');
      }
      await deleteWorker(id);
      await load();
    }
  }

  // ── Payroll CRUD ────────────────────────────────────────────────────────────

  const loadPayroll = useCallback(async () => {
    const userId = session?.user?.id;
    if (!userId) return;
    setPayrollLoading(true);
    try {
      const { data, error } = await supabase.from('team_payroll').select('*').eq('user_id', userId).order('name');
      if (error) {
        console.error('[payroll] loadPayroll error:', JSON.stringify(error));
      }
      setPayrollEmployees(data ?? []);
    } catch (err) {
      console.error('[payroll] loadPayroll exception:', err);
    } finally { setPayrollLoading(false); }
  }, [session]);

  useEffect(() => { loadPayroll(); }, [loadPayroll]);

  function openAddEmployee(emp?: PayrollEmployee) {
    setEmpSaveError(null);
    if (emp) {
      setEditEmployee(emp);
      setEmpName(emp.name);
      setEmpRole(emp.role);
      setEmpGross(String(emp.gross_salary));
      setEmpHours(String(emp.hours_per_month));
      setEmpTaxOverride(emp.tax_rate_override !== null ? String(emp.tax_rate_override) : '');
    } else {
      setEditEmployee(null);
      setEmpName(''); setEmpRole(''); setEmpGross(''); setEmpHours('160'); setEmpTaxOverride('');
    }
    setShowAddEmployee(true);
  }

  async function handleSaveEmployee() {
    const userId = session?.user?.id;
    if (!userId) { setEmpSaveError('Not signed in.'); return; }
    const gross = parseFloat(empGross.replace(',', '.'));
    const hours = parseFloat(empHours) || 160;
    if (!empName.trim() || isNaN(gross) || gross <= 0) return;
    const taxOverride = empTaxOverride.trim() !== '' ? parseFloat(empTaxOverride.replace(',', '.')) : null;
    const payload = {
      name: empName.trim(),
      role: empRole.trim(),
      gross_salary: gross,
      hours_per_month: hours,
      tax_rate_override: taxOverride,
      user_id: userId,
    };
    setEmpSaveError(null);
    try {
      console.log('[payroll] saving employee payload:', JSON.stringify(payload));
      if (editEmployee) {
        const { error } = await supabase.from('team_payroll').update(payload).eq('id', editEmployee.id).eq('user_id', userId);
        if (error) {
          console.error('[payroll] update error:', JSON.stringify(error));
          setEmpSaveError(error.message || 'Update failed. Check console for details.');
          return;
        }
      } else {
        const { error } = await supabase.from('team_payroll').insert(payload);
        if (error) {
          console.error('[payroll] insert error:', JSON.stringify(error));
          setEmpSaveError(error.message || 'Insert failed. Check console for details.');
          return;
        }
      }
      setShowAddEmployee(false);
      await loadPayroll();
    } catch (err) {
      console.error('[payroll] save employee exception:', err);
      setEmpSaveError(err instanceof Error ? err.message : 'Unexpected error. Check console.');
    }
  }

  async function handleDeleteEmployee(id: string) {
    const userId = session?.user?.id;
    if (!userId) return;
    const idx = await showDialog(t('delete'), t('removeThisWorker'), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('delete'), style: 'destructive' },
    ]);
    if (idx === 1) {
      await supabase.from('team_payroll').delete().eq('id', id).eq('user_id', userId);
      setShowBreakdown(false);
      await loadPayroll();
    }
  }

  const payrollSummary = useMemo(() => {
    const totalGross = payrollEmployees.reduce((s, e) => s + e.gross_salary, 0);
    const totalNet   = payrollEmployees.reduce((s, e) => s + calcPayroll(e).netPay, 0);
    const totalCost  = payrollEmployees.reduce((s, e) => s + calcPayroll(e).totalErCost, 0);
    return { totalGross, totalNet, totalCost, count: payrollEmployees.length };
  }, [payrollEmployees]);

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
          <Text style={styles.title}>{activeTab === 'team' ? t('team') : t('payroll')}</Text>
          {activeTab === 'team' ? (
            <Pressable style={styles.addBtn} onPress={() => setShowAddWorker(true)}>
              <Feather name="plus" size={15} color={COLORS.background} />
              <Text style={styles.addBtnText}>{t('addWorker')}</Text>
            </Pressable>
          ) : (
            <Pressable style={styles.addBtn} onPress={() => openAddEmployee()}>
              <Feather name="plus" size={15} color={COLORS.background} />
              <Text style={styles.addBtnText}>{t('addEmployee')}</Text>
            </Pressable>
          )}
        </View>
        <View style={styles.divider} />

        {/* Tab switcher */}
        <View style={styles.tabRow}>
          <Pressable
            style={[styles.tabBtn, activeTab === 'team' && styles.tabBtnActive]}
            onPress={() => setActiveTab('team')}
          >
            <Feather name="users" size={13} color={activeTab === 'team' ? COLORS.primary : COLORS.muted} />
            <Text style={[styles.tabLabel, activeTab === 'team' && styles.tabLabelActive]}>Team</Text>
          </Pressable>
          <Pressable
            style={[styles.tabBtn, activeTab === 'payroll' && styles.tabBtnActive]}
            onPress={() => setActiveTab('payroll')}
          >
            <Feather name="dollar-sign" size={13} color={activeTab === 'payroll' ? COLORS.primary : COLORS.muted} />
            <Text style={[styles.tabLabel, activeTab === 'payroll' && styles.tabLabelActive]}>{t('payroll')}</Text>
          </Pressable>
        </View>

        {/* ── PAYROLL TAB ─────────────────────────────────────────────────── */}
        {activeTab === 'payroll' && (
          <>
            {payrollLoading ? (
              <ActivityIndicator color={COLORS.primary} style={{ marginTop: 24 }} />
            ) : (
              <>
                {/* Summary card */}
                {payrollEmployees.length > 0 && (
                  <View style={styles.payrollSummaryCard}>
                    <View style={styles.payrollSummaryItem}>
                      <Text style={styles.payrollSummaryLabel}>{t('employeeCount')}</Text>
                      <Text style={styles.payrollSummaryValue}>{payrollSummary.count}</Text>
                    </View>
                    <View style={styles.payrollSummarySep} />
                    <View style={styles.payrollSummaryItem}>
                      <Text style={styles.payrollSummaryLabel}>{t('totalNetPay')}</Text>
                      <Text style={[styles.payrollSummaryValue, { color: COLORS.success }]}>{formatCurrency(payrollSummary.totalNet, currency)}</Text>
                    </View>
                    <View style={styles.payrollSummarySep} />
                    <View style={styles.payrollSummaryItem}>
                      <Text style={styles.payrollSummaryLabel}>{t('totalCost')}</Text>
                      <Text style={[styles.payrollSummaryValue, { color: COLORS.danger }]}>{formatCurrency(payrollSummary.totalCost, currency)}</Text>
                    </View>
                  </View>
                )}

                {/* Employee list */}
                {payrollEmployees.length === 0 ? (
                  <View style={styles.emptyCard}>
                    <Feather name="briefcase" size={32} color={COLORS.muted} />
                    <Text style={styles.emptyTitle}>{t('noEmployeesYet')}</Text>
                    <Text style={styles.emptyDesc}>{t('addEmployeeToStart')}</Text>
                    <Pressable style={styles.emptyAddBtn} onPress={() => openAddEmployee()}>
                      <Text style={styles.emptyAddBtnText}>{t('addEmployee')}</Text>
                    </Pressable>
                  </View>
                ) : (
                  payrollEmployees.map(emp => {
                    const c = calcPayroll(emp);
                    return (
                      <Pressable
                        key={emp.id}
                        style={({ pressed }) => [styles.payrollCard, pressed && { opacity: 0.8 }]}
                        onPress={() => { setSelectedEmployee(emp); setShowBreakdown(true); }}
                      >
                        <View style={styles.payrollCardTop}>
                          <View style={styles.workerAvatar}>
                            <Text style={styles.workerAvatarText}>{emp.name.charAt(0).toUpperCase()}</Text>
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.workerName}>{emp.name}</Text>
                            <Text style={styles.workerCategory}>{emp.role || '—'}</Text>
                          </View>
                          <Feather name="chevron-right" size={14} color={COLORS.muted} />
                        </View>
                        <View style={styles.payrollCardStats}>
                          <View style={styles.payrollStat}>
                            <Text style={styles.payrollStatLabel}>{t('gross')}</Text>
                            <Text style={styles.payrollStatValue}>{formatCurrency(c.gross, currency)}</Text>
                          </View>
                          <View style={styles.payrollStat}>
                            <Text style={styles.payrollStatLabel}>{t('netPay')}</Text>
                            <Text style={[styles.payrollStatValue, { color: COLORS.success }]}>{formatCurrency(c.netPay, currency)}</Text>
                          </View>
                          <View style={styles.payrollStat}>
                            <Text style={styles.payrollStatLabel}>{t('employerCost')}</Text>
                            <Text style={[styles.payrollStatValue, { color: COLORS.danger }]}>{formatCurrency(c.totalErCost, currency)}</Text>
                          </View>
                        </View>
                      </Pressable>
                    );
                  })
                )}

                {/* Rates note */}
                {payrollEmployees.length > 0 && (
                  <Text style={styles.payrollNote}>
                    Finnish 2025 rates · TyEL 7.45% · TVR 0.79% · SV 1.53% (employee){'\n'}
                    Employer: TyEL 17.34% · TVR 1.32% · SV 1.53% · Progressive income tax
                  </Text>
                )}
              </>
            )}
          </>
        )}

        {/* ── TEAM TAB ────────────────────────────────────────────────────── */}
        {activeTab === 'team' && (
          <>
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
                showDialog(t('noWorkers'), t('addFirstWorker'));
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
      {/* Add / Edit Employee Modal */}
      {showAddEmployee && (
        <Modal visible={showAddEmployee} animationType="slide" presentationStyle="pageSheet">
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: COLORS.background }}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editEmployee ? t('editEmployee') : t('addEmployee')}</Text>
              <Pressable onPress={() => setShowAddEmployee(false)}>
                <Feather name="x" size={22} color={COLORS.text} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.modalContent}>
              <Text style={styles.fieldLabel}>{t('fullName')}</Text>
              <TextInput style={styles.input} value={empName} onChangeText={setEmpName} placeholder="e.g. Mikael Virtanen" placeholderTextColor={COLORS.muted} autoFocus />

              <Text style={[styles.fieldLabel, { marginTop: 16 }]}>{t('roleTitle')}</Text>
              <TextInput style={styles.input} value={empRole} onChangeText={setEmpRole} placeholder="e.g. Developer" placeholderTextColor={COLORS.muted} />

              <Text style={[styles.fieldLabel, { marginTop: 16 }]}>{t('grossMonthlySalary')} ({currency})</Text>
              <TextInput style={styles.input} value={empGross} onChangeText={setEmpGross} placeholder="3500.00" placeholderTextColor={COLORS.muted} keyboardType="decimal-pad" />

              <Text style={[styles.fieldLabel, { marginTop: 16 }]}>{t('hoursPerMonth')}</Text>
              <TextInput style={styles.input} value={empHours} onChangeText={setEmpHours} placeholder="160" placeholderTextColor={COLORS.muted} keyboardType="decimal-pad" />

              <Text style={[styles.fieldLabel, { marginTop: 16 }]}>{t('taxRateOverride')} <Text style={{ color: COLORS.muted, textTransform: 'none' }}>({t('taxRateOverrideHint')})</Text></Text>
              <TextInput style={styles.input} value={empTaxOverride} onChangeText={setEmpTaxOverride} placeholder="e.g. 28" placeholderTextColor={COLORS.muted} keyboardType="decimal-pad" />

              {empSaveError ? (
                <Text style={{ color: COLORS.danger, fontSize: 13, marginTop: 12, textAlign: 'center' }}>
                  {empSaveError}
                </Text>
              ) : null}

              <Pressable
                style={[styles.saveBtn, (!empName.trim() || !empGross) && { opacity: 0.4 }]}
                onPress={handleSaveEmployee}
                disabled={!empName.trim() || !empGross}
              >
                <Text style={styles.saveBtnText}>{editEmployee ? t('update') : t('addEmployee')}</Text>
              </Pressable>
            </ScrollView>
          </KeyboardAvoidingView>
        </Modal>
      )}

      {/* Payroll Breakdown Modal */}
      {showBreakdown && selectedEmployee && (() => {
        const c = calcPayroll(selectedEmployee);
        const fmt = (v: number) => formatCurrency(v, currency);
        const pct = (v: number) => `${(v * 100).toFixed(2)}%`;
        return (
          <Modal visible={showBreakdown} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowBreakdown(false)}>
            <View style={{ flex: 1, backgroundColor: COLORS.background }}>
              <View style={styles.modalHeader}>
                <View>
                  <Text style={styles.modalTitle}>{selectedEmployee.name}</Text>
                  {selectedEmployee.role ? <Text style={styles.workerCategory}>{selectedEmployee.role}</Text> : null}
                </View>
                <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
                  <Pressable onPress={() => { setShowBreakdown(false); openAddEmployee(selectedEmployee); }} hitSlop={8}>
                    <Feather name="edit-2" size={18} color={COLORS.primary} />
                  </Pressable>
                  <Pressable onPress={() => handleDeleteEmployee(selectedEmployee.id)} hitSlop={8}>
                    <Feather name="trash-2" size={18} color={COLORS.danger} />
                  </Pressable>
                  <Pressable onPress={() => setShowBreakdown(false)} hitSlop={8}>
                    <Feather name="x" size={22} color={COLORS.text} />
                  </Pressable>
                </View>
              </View>
              <ScrollView contentContainerStyle={[styles.modalContent, { gap: 16 }]}>

                {/* Employee side */}
                <View style={styles.breakdownCard}>
                  <Text style={styles.breakdownCardTitle}>{t('employeeDeductions')}</Text>
                  <View style={styles.breakdownRow}>
                    <Text style={styles.breakdownLabel}>{t('grossSalary')}</Text>
                    <Text style={styles.breakdownValue}>{fmt(c.gross)}</Text>
                  </View>
                  <View style={[styles.breakdownRow, { borderTopWidth: 1, borderTopColor: COLORS.border }]}>
                    <Text style={styles.breakdownLabel}>TyEL Pension ({pct(TYEL_EMP)})</Text>
                    <Text style={[styles.breakdownValue, { color: COLORS.danger }]}>−{fmt(c.tyel)}</Text>
                  </View>
                  <View style={styles.breakdownRow}>
                    <Text style={styles.breakdownLabel}>TVR Unemployment ({pct(TVR_EMP)})</Text>
                    <Text style={[styles.breakdownValue, { color: COLORS.danger }]}>−{fmt(c.tvr)}</Text>
                  </View>
                  <View style={styles.breakdownRow}>
                    <Text style={styles.breakdownLabel}>SV Health Ins. ({pct(SV_EMP)})</Text>
                    <Text style={[styles.breakdownValue, { color: COLORS.danger }]}>−{fmt(c.sv)}</Text>
                  </View>
                  <View style={[styles.breakdownRow, { borderTopWidth: 1, borderTopColor: COLORS.border }]}>
                    <Text style={[styles.breakdownLabel, { color: COLORS.muted }]}>{t('taxableIncome')}</Text>
                    <Text style={styles.breakdownValue}>{fmt(c.taxableIncome)}</Text>
                  </View>
                  <View style={styles.breakdownRow}>
                    <Text style={styles.breakdownLabel}>
                      Income Tax {selectedEmployee.tax_rate_override !== null ? `(${selectedEmployee.tax_rate_override}% override)` : `(${pct(c.effectiveTaxRate)} eff.)`}
                    </Text>
                    <Text style={[styles.breakdownValue, { color: COLORS.danger }]}>−{fmt(c.incomeTax)}</Text>
                  </View>
                  <View style={[styles.breakdownRow, styles.breakdownTotal]}>
                    <Text style={styles.breakdownTotalLabel}>{t('netPay')}</Text>
                    <Text style={[styles.breakdownTotalValue, { color: COLORS.success }]}>{fmt(c.netPay)}</Text>
                  </View>
                </View>

                {/* Employer side */}
                <View style={styles.breakdownCard}>
                  <Text style={styles.breakdownCardTitle}>{t('employerContributions')}</Text>
                  <View style={styles.breakdownRow}>
                    <Text style={styles.breakdownLabel}>{t('grossSalary')}</Text>
                    <Text style={styles.breakdownValue}>{fmt(c.gross)}</Text>
                  </View>
                  <View style={[styles.breakdownRow, { borderTopWidth: 1, borderTopColor: COLORS.border }]}>
                    <Text style={styles.breakdownLabel}>TyEL Pension ({pct(TYEL_ER)})</Text>
                    <Text style={[styles.breakdownValue, { color: COLORS.warning }]}>+{fmt(c.erTyel)}</Text>
                  </View>
                  <View style={styles.breakdownRow}>
                    <Text style={styles.breakdownLabel}>TVR Unemployment ({pct(TVR_ER)})</Text>
                    <Text style={[styles.breakdownValue, { color: COLORS.warning }]}>+{fmt(c.erTvr)}</Text>
                  </View>
                  <View style={styles.breakdownRow}>
                    <Text style={styles.breakdownLabel}>SV Health Ins. ({pct(SV_ER)})</Text>
                    <Text style={[styles.breakdownValue, { color: COLORS.warning }]}>+{fmt(c.erSv)}</Text>
                  </View>
                  <View style={[styles.breakdownRow, styles.breakdownTotal]}>
                    <Text style={styles.breakdownTotalLabel}>{t('totalEmployerCost')}</Text>
                    <Text style={[styles.breakdownTotalValue, { color: COLORS.danger }]}>{fmt(c.totalErCost)}</Text>
                  </View>
                </View>

                <Text style={styles.payrollNote}>
                  Finnish 2025 statutory rates. Income tax uses progressive brackets unless overridden.
                </Text>
              </ScrollView>
            </View>
          </Modal>
        );
      })()}

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

  // ── Tab switcher ────────────────────────────────────────────────────────────
  tabRow: { flexDirection: 'row', backgroundColor: COLORS.cardElevated, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, padding: 3, gap: 3 },
  tabBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8, borderRadius: 9 },
  tabBtnActive: { backgroundColor: COLORS.primary + '18', borderWidth: 1, borderColor: COLORS.primary + '40' },
  tabLabel: { fontSize: 12, fontWeight: '600', color: COLORS.muted },
  tabLabelActive: { color: COLORS.primary },

  // ── Payroll ─────────────────────────────────────────────────────────────────
  payrollSummaryCard: { backgroundColor: COLORS.card, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, padding: 14, flexDirection: 'row', alignItems: 'center' },
  payrollSummaryItem: { flex: 1, alignItems: 'center', gap: 3 },
  payrollSummarySep: { width: 1, height: 36, backgroundColor: COLORS.border },
  payrollSummaryLabel: { fontSize: 9, color: COLORS.muted, textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: '600' },
  payrollSummaryValue: { fontSize: 14, fontWeight: '700', color: COLORS.text, letterSpacing: -0.3 },

  payrollCard: { backgroundColor: COLORS.card, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, padding: 14, gap: 10 },
  payrollCardTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  payrollCardStats: { flexDirection: 'row', gap: 0, borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: 10 },
  payrollStat: { flex: 1, alignItems: 'center', gap: 3 },
  payrollStatLabel: { fontSize: 9, color: COLORS.muted, textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: '600' },
  payrollStatValue: { fontSize: 13, fontWeight: '700', color: COLORS.text, letterSpacing: -0.3 },
  payrollNote: { fontSize: 10, color: COLORS.muted, lineHeight: 15, textAlign: 'center' },

  // ── Breakdown modal ──────────────────────────────────────────────────────────
  breakdownCard: { backgroundColor: COLORS.card, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden' },
  breakdownCardTitle: { fontSize: 9, color: COLORS.primary, textTransform: 'uppercase', letterSpacing: 1.5, fontWeight: '700', padding: 12, paddingBottom: 10 },
  breakdownRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 9 },
  breakdownLabel: { fontSize: 12, color: COLORS.textSecondary, flex: 1 },
  breakdownValue: { fontSize: 13, fontWeight: '600', color: COLORS.text },
  breakdownTotal: { backgroundColor: COLORS.surface, borderTopWidth: 1, borderTopColor: COLORS.border },
  breakdownTotalLabel: { fontSize: 12, fontWeight: '700', color: COLORS.text, flex: 1 },
  breakdownTotalValue: { fontSize: 15, fontWeight: '700', letterSpacing: -0.3 },
});
