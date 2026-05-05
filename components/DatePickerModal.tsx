import React, { useEffect, useState } from 'react';
import { Modal, View, Text, Pressable, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { COLORS } from '@/constants/colors';
import { useLanguage } from '@/contexts/LanguageContext';

interface Props {
  visible: boolean;
  value: string;      // YYYY-MM-DD
  onConfirm: (date: string) => void;
  onCancel: () => void;
  title?: string;
}

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];
const WEEK_DAYS = ['Mo','Tu','We','Th','Fr','Sa','Su'];
const CELL = 38;

function parseDate(s: string): Date {
  const d = new Date(s + 'T12:00:00');
  return isNaN(d.getTime()) ? new Date() : d;
}

function toYMD(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export default function DatePickerModal({ visible, value, onConfirm, onCancel, title }: Props) {
  const { t } = useLanguage();
  const styles = makeStyles();
  const initial = parseDate(value);

  const [year, setYear] = useState(initial.getFullYear());
  const [month, setMonth] = useState(initial.getMonth());
  const [selected, setSelected] = useState(value);

  useEffect(() => {
    if (visible) {
      const d = parseDate(value);
      setYear(d.getFullYear());
      setMonth(d.getMonth());
      setSelected(value);
    }
  }, [visible, value]);

  const prevMonth = () => {
    if (month === 0) { setMonth(11); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 11) { setMonth(0); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  };

  // Build calendar grid (Mon-start)
  const firstDow = new Date(year, month, 1).getDay(); // 0=Sun
  const offset = (firstDow + 6) % 7;                 // Mon=0
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(offset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const rows: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));

  const todayStr = new Date().toISOString().split('T')[0];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <View style={styles.container}>
          {title ? <Text style={styles.title}>{title}</Text> : null}

          {/* Month / Year navigation */}
          <View style={styles.navRow}>
            <Pressable style={styles.navBtn} onPress={prevMonth}>
              <Feather name="chevron-left" size={18} color={COLORS.text} />
            </Pressable>
            <Text style={styles.monthLabel}>{MONTHS[month]} {year}</Text>
            <Pressable style={styles.navBtn} onPress={nextMonth}>
              <Feather name="chevron-right" size={18} color={COLORS.text} />
            </Pressable>
          </View>

          {/* Weekday header */}
          <View style={styles.weekRow}>
            {WEEK_DAYS.map(d => (
              <Text key={d} style={styles.weekDay}>{d}</Text>
            ))}
          </View>

          {/* Day grid */}
          {rows.map((row, ri) => (
            <View key={ri} style={styles.weekRow}>
              {row.map((day, di) => {
                if (!day) return <View key={di} style={styles.dayCell} />;
                const dateStr = toYMD(year, month, day);
                const isSel = dateStr === selected;
                const isToday = dateStr === todayStr;
                return (
                  <Pressable
                    key={di}
                    style={[
                      styles.dayCell,
                      styles.dayBtn,
                      isSel && styles.daySel,
                      isToday && !isSel && styles.dayToday,
                    ]}
                    onPress={() => setSelected(dateStr)}
                  >
                    <Text style={[
                      styles.dayText,
                      isSel && styles.dayTextSel,
                      isToday && !isSel && styles.dayTextToday,
                    ]}>
                      {day}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ))}

          {/* Confirm / Cancel */}
          <View style={styles.actions}>
            <Pressable style={styles.cancelBtn} onPress={onCancel}>
              <Text style={styles.cancelText}>{t('cancel')}</Text>
            </Pressable>
            <Pressable style={styles.confirmBtn} onPress={() => onConfirm(selected)}>
              <Text style={styles.confirmText}>{t('apply')}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = () => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.93)',
    justifyContent: 'center', alignItems: 'center', padding: 24,
  },
  container: {
    backgroundColor: COLORS.card, borderRadius: 20,
    borderWidth: 1, borderColor: COLORS.border,
    padding: 20, width: '100%', maxWidth: 330, gap: 4,
  },
  title: {
    fontSize: 10, color: COLORS.muted, textTransform: 'uppercase',
    letterSpacing: 1.5, fontWeight: '700', marginBottom: 4, textAlign: 'center',
  },
  navRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 8,
  },
  navBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    alignItems: 'center', justifyContent: 'center',
  },
  monthLabel: { fontSize: 16, fontWeight: '700', color: COLORS.text, letterSpacing: -0.3 },
  weekRow: { flexDirection: 'row' },
  weekDay: {
    width: CELL, textAlign: 'center', fontSize: 9, fontWeight: '700',
    color: COLORS.muted, textTransform: 'uppercase', paddingVertical: 6,
  },
  dayCell: { width: CELL, height: CELL, alignItems: 'center', justifyContent: 'center' },
  dayBtn: { borderRadius: CELL / 2 },
  daySel: { backgroundColor: COLORS.primary },
  dayToday: {
    backgroundColor: COLORS.primaryDim,
    borderWidth: 1, borderColor: COLORS.primary + '60',
  },
  dayText: { fontSize: 13, fontWeight: '500', color: COLORS.text },
  dayTextSel: { color: COLORS.background, fontWeight: '700' },
  dayTextToday: { color: COLORS.primary, fontWeight: '700' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  cancelBtn: {
    flex: 1, paddingVertical: 13, borderRadius: 10,
    borderWidth: 1, borderColor: COLORS.border, alignItems: 'center',
  },
  cancelText: { fontSize: 13, color: COLORS.muted, fontWeight: '500' },
  confirmBtn: {
    flex: 1, paddingVertical: 13, borderRadius: 10,
    backgroundColor: COLORS.primary, alignItems: 'center',
  },
  confirmText: { fontSize: 13, color: COLORS.background, fontWeight: '700' },
});
