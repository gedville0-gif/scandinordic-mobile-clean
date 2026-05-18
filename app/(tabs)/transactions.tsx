import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, Pressable, TextInput, Modal,
  Alert, RefreshControl, KeyboardAvoidingView, Platform, Switch,
  Image, ActivityIndicator,
} from 'react-native';
// Alert is kept for non-user-facing / development notices only
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { COLORS } from '@/constants/colors';
import { TransactionItem } from '@/components/TransactionItem';
import { getTransactions, saveTransaction, deleteTransaction, bulkDeleteTransactions, getInvoices, getSettings } from '@/lib/storage';
import { formatCents, addCents, subtractCents, multiplyCents, toCents, zeroCents, type Cents } from '@/lib/money';
import type { Transaction, TransactionType, Currency } from '@/lib/types';
import { INCOME_CATEGORIES, EXPENSE_CATEGORIES, detectCategory } from '@/constants/categories';
import { useLanguage } from '@/contexts/LanguageContext';
import { useLocalSearchParams } from 'expo-router';
import { useAppDialog } from '@/components/AppDialog';
import DatePickerModal from '@/components/DatePickerModal';
import { PDFReviewModal } from '@/components/PDFReviewModal';
import { supabase } from '@/lib/supabase';
import { useAnalytics } from '@/lib/analytics';
import { decode } from 'base64-arraybuffer';
import * as FileSystem from 'expo-file-system/legacy';

// ─── Dynamic imports (graceful degradation) ──────────────────────────────────

let ImagePicker: any = null;
let DocumentPicker: any = null;
let Papa: any = null;
try { ImagePicker = require('expo-image-picker'); } catch {}
try { DocumentPicker = require('expo-document-picker'); } catch {}
try { Papa = require('papaparse'); } catch {}

// ─── Constants ────────────────────────────────────────────────────────────────

const VAT_PRESETS = [0, 10, 13.5, 25.5];

function getCatIcon(key: string): string {
  return [...INCOME_CATEGORIES, ...EXPENSE_CATEGORIES].find(c => c.id === key)?.icon ?? 'tag';
}

function catLabel(key: string, _t?: (k: string) => string): string {
  const cat = [...INCOME_CATEGORIES, ...EXPENSE_CATEGORIES].find(c => c.id === key);
  if (cat) return cat.label;
  return key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' ');
}

function getVeroCategory(categoryId: string, type: TransactionType): string {
  const cats = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  return cats.find(c => c.id === categoryId)?.veroCategory ?? 'Unclassified';
}

function generateId() { return Date.now().toString(36) + Math.random().toString(36).slice(2); }

function parseAmount(s: string): number {
  if (!s) return 0;
  const cleaned = s.replace(/[€$£\s]/g, '').replace(',', '.');
  return Math.abs(parseFloat(cleaned) || 0);
}

function parseSignedAmount(s: string): number {
  if (!s) return 0;
  const cleaned = s.replace(/[€$£\s]/g, '').replace(',', '.');
  return parseFloat(cleaned) || 0;
}

function parseCsvDate(s: string): string {
  if (!s) return new Date().toISOString().split('T')[0];
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
  // Finnish DD.MM.YYYY
  const parts = s.split('.');
  if (parts.length === 3) {
    const d2 = new Date(`${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`);
    if (!isNaN(d2.getTime())) return d2.toISOString().split('T')[0];
  }
  return new Date().toISOString().split('T')[0];
}

// Extract merchant/store name from receipt OCR text
function extractMerchant(text: string): string {
  const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);

  // First non-empty line is usually the merchant name
  if (lines.length > 0) {
    return lines[0].substring(0, 50); // Limit length
  }

  return '';
}

// Extract total amount from receipt OCR text
function extractAmount(text: string): number | null {
  // Look for total amount patterns with Finnish formatting
  const patterns = [
    /total[:\s]*€?\s*([\d,]+\.?\d*)\s*€?/i,
    /sum[:\s]*€?\s*([\d,]+\.?\d*)\s*€?/i,
    /yhteensä[:\s]*€?\s*([\d,]+\.?\d*)\s*€?/i,
    /summa[:\s]*€?\s*([\d,]+\.?\d*)\s*€?/i,
    /([\d,]+\.?\d*)\s*€/g,  // Amount followed by €
    /€\s*([\d,]+\.?\d*)/g,  // € followed by amount
    /([\d]+[,\.]\d{2})/g    // Finnish decimal format: 12,50 or 12.50
  ];

  const amounts: number[] = [];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const amountStr = match[1];
      if (amountStr) {
        // Handle Finnish comma decimal format: 12,50 → 12.50
        const normalized = amountStr.replace(',', '.');
        const amount = parseFloat(normalized);
        if (amount > 0 && amount < 10000) { // Reasonable range for receipts
          amounts.push(amount);
        }
      }
    }
  }

  // Return the largest reasonable amount (likely the total)
  if (amounts.length > 0) {
    return Math.max(...amounts);
  }

  return null;
}

// Extract date from receipt OCR text
function extractDate(text: string): string | null {
  // Look for date patterns
  const datePatterns = [
    /(\d{1,2})[\.\/](\d{1,2})[\.\/](\d{2,4})/,
    /(\d{2,4})-(\d{1,2})-(\d{1,2})/
  ];

  for (const pattern of datePatterns) {
    const match = text.match(pattern);
    if (match) {
      const [, p1, p2, p3] = match;
      // Try DD.MM.YYYY format
      if (p3.length === 4) {
        return `${p3}-${p2.padStart(2, '0')}-${p1.padStart(2, '0')}`;
      }
      // Try YYYY-MM-DD format
      if (p1.length === 4) {
        return `${p1}-${p2.padStart(2, '0')}-${p3.padStart(2, '0')}`;
      }
    }
  }

  return null;
}

// Parse Finnish ALV breakdown table (ALV% / Veroton / Vero / Verollinen)
function extractAlvBreakdown(text: string): { vatRate: number; grossAmount: number }[] {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  let headerIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const lower = lines[i].toLowerCase();
    if ((lower.includes('alv') || lower.includes('moms')) &&
        (lower.includes('verollinen') || lower.includes('yhteensä') || lower.includes('veroll') || lower.includes('summa'))) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) return [];
  const results: { vatRate: number; grossAmount: number }[] = [];
  for (let i = headerIdx + 1; i < lines.length && i < headerIdx + 8; i++) {
    const nums = lines[i].match(/\d+[,.]\d+/g);
    if (!nums || nums.length < 2) break;
    const vatRate = parseFloat(nums[0].replace(',', '.'));
    const gross = parseFloat(nums[nums.length - 1].replace(',', '.'));
    if (isNaN(vatRate) || isNaN(gross) || vatRate < 0 || vatRate > 100 || gross <= 0) break;
    results.push({ vatRate, grossAmount: gross });
  }
  return results.length >= 2 ? results : [];
}

// ─── Add Transaction Modal ────────────────────────────────────────────────────

interface AddModalProps {
  visible: boolean;
  type: TransactionType;
  onClose: () => void;
  onSave: (t: Transaction) => void;
  t: (k: string) => string;
}

function AddModal({ visible, type, onClose, onSave, t }: AddModalProps) {
  const modalStyles = makeModalStyles();
  const insets = useSafeAreaInsets();
  const { show: showDialog, dialog } = useAppDialog();
  const color = type === 'income' ? COLORS.success : COLORS.danger;

  const [desc, setDesc] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState(() => type === 'income' ? 'consulting_services' : 'fuel');
  const [vatRate, setVatRate] = useState('25.5');
  const [vatIncluded, setVatIncluded] = useState(false);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [clientName, setClientName] = useState('');
  const [status, setStatus] = useState<'paid' | 'unpaid'>('paid');
  const [note, setNote] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showCatSheet, setShowCatSheet] = useState(false);
  const [catSearch, setCatSearch] = useState('');
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customInputText, setCustomInputText] = useState('');
  const [categoryManuallySet, setCategoryManuallySet] = useState(false);
  const saveGuard = useRef(false);

  useEffect(() => {
    if (categoryManuallySet || !desc.trim()) return;
    const detected = detectCategory(desc, type);
    if (detected) setCategory(detected);
  }, [desc, categoryManuallySet, type]);

  const amt = parseFloat(amount.replace(',', '.')) || 0;
  const vp = parseFloat(vatRate) || 0;
  let netAmt: number, vatAmt: number, totalAmt: number;
  if (vatIncluded) {
    totalAmt = amt; netAmt = totalAmt / (1 + vp / 100); vatAmt = totalAmt - netAmt;
  } else {
    netAmt = amt; vatAmt = amt * vp / 100; totalAmt = amt + vatAmt;
  }

  const reset = () => {
    saveGuard.current = false;
    setDesc(''); setAmount('');
    setCategory(type === 'income' ? 'consulting_services' : 'fuel');
    setVatRate('25.5');
    setVatIncluded(false); setDate(new Date().toISOString().split('T')[0]);
    setClientName(''); setStatus('paid'); setNote('');
    setShowCatSheet(false); setCatSearch('');
    setShowCustomInput(false); setCustomInputText('');
    setCategoryManuallySet(false);
  };

  const handleSave = () => {
    if (saveGuard.current) return;
    if (!desc.trim() || !amount) {
      showDialog('Missing fields', 'Please fill in title and amount.');
      return;
    }
    if (isNaN(amt) || amt <= 0) { showDialog('Invalid amount'); return; }
    saveGuard.current = true;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onSave({
      id: generateId(),
      type,
      amountCents: toCents(netAmt),
      description: desc.trim(),
      category: category,
      veroCategory: getVeroCategory(category, type),
      date: date || new Date().toISOString().split('T')[0],
      vatRate: vp,
      clientName: type === 'income' ? clientName : undefined,
      status: type === 'income' ? status : undefined,
      note: type === 'expense' ? note : undefined,
    });
    reset();
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: COLORS.background }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={[modalStyles.header, { paddingTop: insets.top + 16 }]}>
          <Pressable onPress={() => { reset(); onClose(); }}>
            <Text style={modalStyles.cancel}>{t('cancel')}</Text>
          </Pressable>
          <Text style={[modalStyles.modalTitle, { color }]}>
            {type === 'income' ? t('addIncome') : t('addExpense')}
          </Text>
          <Pressable onPress={handleSave}>
            <Text style={[modalStyles.save, { color }]}>{t('save')}</Text>
          </Pressable>
        </View>

        <ScrollView style={modalStyles.body} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Text style={modalStyles.label}>{t('description')}</Text>
          <TextInput style={modalStyles.input} placeholder={t('description')} placeholderTextColor={COLORS.muted} value={desc} onChangeText={setDesc} />

          <View style={modalStyles.toggleRow}>
            <Text style={modalStyles.toggleLabel}>{vatIncluded ? t('vatIncluded') : t('vatExcluded')}</Text>
            <Switch value={vatIncluded} onValueChange={v => { setVatIncluded(v); Haptics.selectionAsync(); }} trackColor={{ false: COLORS.border, true: COLORS.primary + '90' }} thumbColor={vatIncluded ? COLORS.primary : COLORS.muted} />
          </View>

          <View style={modalStyles.twoCol}>
            <View style={modalStyles.colHalf}>
              <Text style={modalStyles.label}>{vatIncluded ? t('totalAmount') : t('netAmount')}</Text>
              <TextInput style={modalStyles.input} placeholder="0.00" placeholderTextColor={COLORS.muted} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" />
            </View>
            {type === 'income' && (
              <View style={modalStyles.colHalf}>
                <Text style={modalStyles.label}>{t('status')}</Text>
                <View style={modalStyles.statusRow}>
                  {(['paid', 'unpaid'] as const).map(s => {
                    const active = status === s;
                    const c = s === 'paid' ? COLORS.success : COLORS.warning;
                    return (
                      <Pressable key={s} style={[modalStyles.chip, active && { backgroundColor: c + '25', borderColor: c }]} onPress={() => { setStatus(s); Haptics.selectionAsync(); }}>
                        <Text style={[modalStyles.chipText, active && { color: c }]}>{t(s)}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            )}
          </View>

          <Text style={modalStyles.label}>{t('category')}</Text>
          <Pressable
            style={[modalStyles.catField, { borderColor: color + '60' }]}
            onPress={() => setShowCatSheet(true)}
          >
            <Feather name={getCatIcon(category) as any} size={16} color={color} />
            <Text style={[modalStyles.catFieldLabel, { color: COLORS.text, flex: 1 }]}>{catLabel(category, t)}</Text>
            <Feather name="chevron-down" size={14} color={COLORS.muted} />
          </Pressable>

          <Text style={modalStyles.label}>{t('vatPresets')}</Text>
          <View style={modalStyles.vatPresetsRow}>
            {VAT_PRESETS.map(v => {
              const active = vatRate === String(v);
              return (
                <Pressable key={v} style={[modalStyles.chip, active && { backgroundColor: COLORS.primaryDim, borderColor: COLORS.primary }]} onPress={() => { setVatRate(String(v)); Haptics.selectionAsync(); }}>
                  <Text style={[modalStyles.chipText, active && { color: COLORS.primary }]}>{v}%</Text>
                </Pressable>
              );
            })}
            <TextInput style={modalStyles.vatCustomInput} placeholder={t('customVat')} placeholderTextColor={COLORS.muted} value={vatRate} onChangeText={setVatRate} keyboardType="decimal-pad" />
          </View>

          <View style={modalStyles.breakdown}>
            <View style={modalStyles.breakdownCard}>
              <Text style={modalStyles.breakdownLabel}>{t('netAmount')}</Text>
              <Text style={modalStyles.breakdownValue}>{netAmt.toFixed(2)}</Text>
            </View>
            <View style={modalStyles.breakdownCard}>
              <Text style={modalStyles.breakdownLabel}>{t('vatAmount')}</Text>
              <Text style={modalStyles.breakdownValue}>{vatAmt.toFixed(2)}</Text>
            </View>
            <View style={modalStyles.breakdownCard}>
              <Text style={modalStyles.breakdownLabel}>{t('totalAmount')}</Text>
              <Text style={[modalStyles.breakdownValue, { color }]}>{totalAmt.toFixed(2)}</Text>
            </View>
          </View>

          <Text style={modalStyles.label}>{t('date')}</Text>
          <Pressable style={[modalStyles.input, { justifyContent: 'center' }]} onPress={() => setShowDatePicker(true)}>
            <Text style={{ color: COLORS.text, fontSize: 14 }}>{date}</Text>
          </Pressable>
          <DatePickerModal
            visible={showDatePicker}
            value={date}
            onConfirm={d => { setDate(d); setShowDatePicker(false); }}
            onCancel={() => setShowDatePicker(false)}
            title={t('date')}
          />

          {type === 'income' && (
            <>
              <Text style={modalStyles.label}>{t('clientName')}</Text>
              <TextInput style={modalStyles.input} placeholder={t('clientName')} placeholderTextColor={COLORS.muted} value={clientName} onChangeText={setClientName} />
            </>
          )}
          {type === 'expense' && (
            <>
              <Text style={modalStyles.label}>{t('note')}</Text>
              <TextInput style={[modalStyles.input, { height: 72, textAlignVertical: 'top', paddingTop: 10 }]} placeholder={t('note')} placeholderTextColor={COLORS.muted} value={note} onChangeText={setNote} multiline />
            </>
          )}
          <View style={{ height: 24 }} />
        </ScrollView>

        {/* Category bottom sheet */}
        <Modal visible={showCatSheet} transparent animationType="slide" onRequestClose={() => setShowCatSheet(false)}>
          <View style={{ flex: 1, justifyContent: 'flex-end' }}>
            <Pressable style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.85)' }]} onPress={() => setShowCatSheet(false)} />
            <View style={[modalStyles.sheet, { paddingBottom: insets.bottom + 16 }]}>
              <View style={modalStyles.sheetHandle} />
              <Text style={modalStyles.sheetTitle}>{t('category')}</Text>
              <View style={modalStyles.sheetSearchWrap}>
                <Feather name="search" size={14} color={COLORS.muted} />
                <TextInput
                  style={modalStyles.sheetSearchInput}
                  placeholder={t('search') || 'Search…'}
                  placeholderTextColor={COLORS.muted}
                  value={catSearch}
                  onChangeText={setCatSearch}
                  autoCorrect={false}
                />
              </View>
              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                {(type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES)
                  .filter(c => catSearch === '' || catLabel(c.id, t).toLowerCase().includes(catSearch.toLowerCase()))
                  .map(c => {
                    const selected = category === c.id;
                    return (
                      <Pressable
                        key={c.id}
                        style={[modalStyles.sheetItem, selected && { backgroundColor: color + '15' }]}
                        onPress={() => {
                          setCategory(c.id); setCategoryManuallySet(true); setCatSearch(''); setShowCatSheet(false); Haptics.selectionAsync();
                        }}
                      >
                        <Feather name={c.icon as any} size={16} color={selected ? color : COLORS.muted} />
                        <Text style={[modalStyles.sheetItemText, selected && { color, fontWeight: '600' }]}>
                          {catLabel(c.id, t)}
                        </Text>
                        {selected && <Feather name="check" size={15} color={color} />}
                      </Pressable>
                    );
                  })}
              </ScrollView>
            </View>
          </View>
        </Modal>

        {/* Custom category input */}
        <Modal visible={showCustomInput} transparent animationType="fade" onRequestClose={() => setShowCustomInput(false)}>
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, backgroundColor: 'rgba(0,0,0,0.85)' }}>
            <Pressable style={modalStyles.customInputBox} onPress={e => e.stopPropagation()}>
              <Text style={modalStyles.customInputTitle}>{t('customCategory')}</Text>
              <TextInput
                style={modalStyles.customInputField}
                placeholder={t('enterCategoryName')}
                placeholderTextColor={COLORS.muted}
                value={customInputText}
                onChangeText={setCustomInputText}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={() => {
                  const name = customInputText.trim();
                  setCategory(name || 'other');
                  setShowCustomInput(false);
                  Haptics.selectionAsync();
                }}
              />
              <View style={modalStyles.customInputBtns}>
                <Pressable style={modalStyles.customInputCancel} onPress={() => { setCategory('other'); setShowCustomInput(false); }}>
                  <Text style={modalStyles.customInputCancelText}>{t('cancel')}</Text>
                </Pressable>
                <Pressable style={[modalStyles.customInputConfirm, { backgroundColor: color }]} onPress={() => {
                  const name = customInputText.trim();
                  setCategory(name || 'other');
                  setShowCustomInput(false);
                  Haptics.selectionAsync();
                }}>
                  <Text style={modalStyles.customInputConfirmText}>{t('save')}</Text>
                </Pressable>
              </View>
            </Pressable>
          </View>
        </Modal>

      {dialog}
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Receipt Review Modal ─────────────────────────────────────────────────────

interface ReceiptReviewModalProps {
  visible: boolean;
  imageUri: string | null;
  imageBase64?: string;
  onClose: () => void;
  onSave: (tx: Transaction) => void;
  t: (k: string) => string;
}

function ReceiptReviewModal({ visible, imageUri, imageBase64, onClose, onSave, t }: ReceiptReviewModalProps) {
  const modalStyles = makeModalStyles();
  const insets = useSafeAreaInsets();
  const { show: showDialog, dialog } = useAppDialog();
  const { track } = useAnalytics();
  const [desc, setDesc] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('other');
  const [vatRows, setVatRows] = useState<{ id: string; rowAmt: string; vatPct: number }[]>([]);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [note, setNote] = useState('');
  const [showCatSheet, setShowCatSheet] = useState(false);
  const [catSearch, setCatSearch] = useState('');
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customInputText, setCustomInputText] = useState('');
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [confidence, setConfidence] = useState<number | null>(null);

  const ocrLowConfidence = confidence !== null && !scanning && confidence <= 0.8;
  const amtNum = parseFloat(amount.replace(',', '.'));
  const saveDisabled = !amount.trim() || isNaN(amtNum) || amtNum <= 0;
  const rowTotal = vatRows.reduce((s, r) => s + (parseFloat(r.rowAmt.replace(',', '.')) || 0), 0);
  const rowMismatch = amtNum > 0 && Math.abs(rowTotal - amtNum) > 0.01;

  // Reset all fields when modal opens
  useEffect(() => {
    if (visible) {
      setDesc(''); setAmount(''); setCategory('other');
      setVatRows([{ id: generateId(), rowAmt: '', vatPct: 25.5 }]);
      setSelectedDate(new Date()); setShowDatePicker(false); setNote('');
      setShowCatSheet(false); setCatSearch('');
      setShowCustomInput(false); setCustomInputText('');
      setScanning(false); setScanError(null); setConfidence(null);
    }
  }, [visible]);

  // Auto-scan whenever a new imageUri arrives
  useEffect(() => {
    if (!imageUri || !visible) return;
    let cancelled = false;

    setScanning(true);
    setScanError(null);
    setConfidence(null);

    // Send image to Google Vision OCR for receipt processing
    (async () => {
      const imageBase64 = await FileSystem.readAsStringAsync(imageUri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const { data: visionResult, error: visionError } = await supabase.functions.invoke('google-vision-ocr', {
        body: {
          image: imageBase64,
          type: 'receipt'
        }
      });

      if (visionError) {
        throw new Error(`Google Vision error: ${visionError.message}`);
      }

      if (!visionResult || !visionResult.success) {
        throw new Error(visionResult?.error || 'OCR failed');
      }

      // Extract receipt data from vision result
      const fullText = visionResult.rawText || '';
      console.log('🧾 RAW OCR TEXT:\n', fullText);

      const merchant = extractMerchant(fullText);
      const amount = extractAmount(fullText);
      const date = extractDate(fullText);

      return {
        merchant,
        amount,
        date,
        confidence: 0.8,
        vatBreakdown: visionResult.vatBreakdown ?? [],
      };
    })()
      .then((result: any) => {
        if (cancelled) return;

        console.log('📋 OCR result keys:', Object.keys(result || {}));

        const merchant = result?.merchant ?? result?.vendor ?? result?.store ?? '';
        const amount   = result?.net_amount ?? result?.amount ?? result?.total ?? null;
        const date     = result?.date ?? null;

        console.log('📋 merchant:', merchant, 'amount:', amount, 'date:', date);

        setDesc(String(merchant));
        if (date) { try { setSelectedDate(new Date(date + 'T12:00:00')); } catch (e) {} }
        if (result?.category && result.category !== 'other') setCategory(result.category);

        const breakdown: { vatRate: number; grossAmount: number }[] = result?.vatBreakdown ?? [];
        if (breakdown.length >= 2) {
          const totalGross = breakdown.reduce((s, r) => s + r.grossAmount, 0);
          setAmount(totalGross.toFixed(2));
          setVatRows(breakdown.map(r => ({ id: generateId(), rowAmt: r.grossAmount.toFixed(2), vatPct: r.vatRate })));
        } else {
          const detectedAmt = amount !== null && amount !== undefined ? String(amount) : '';
          setAmount(detectedAmt);
          const detectedVat = (result?.vat_rate !== null && result?.vat_rate !== undefined) ? Number(result.vat_rate) : 25.5;
          setVatRows([{ id: generateId(), rowAmt: detectedAmt, vatPct: detectedVat }]);
        }
        setConfidence(result?.confidence ?? null);
        track('receipt_scanned', {
          confidence: result?.confidence ?? null,
          vat_row_count: breakdown.length,
          amount_detected: amount !== null && amount !== undefined,
          merchant_detected: !!merchant,
        });
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setScanError(err.message ?? 'OCR failed');
      })
      .finally(() => {
        if (!cancelled) setScanning(false);
      });

    return () => { cancelled = true; };
  }, [imageUri, visible]);

  const handleSave = async () => {
    if (!desc.trim() || !amount) { showDialog(t('missingFields'), t('fillTitleAmount')); return; }
    const amt = parseFloat(amount.replace(',', '.'));
    if (isNaN(amt) || amt <= 0) { showDialog(t('invalidAmount') || 'Invalid amount'); return; }
    const rowNetTotal = vatRows.reduce((s, r) => s + (parseFloat(r.rowAmt.replace(',', '.')) || 0), 0);
    const rowVatTotal = vatRows.reduce((s, r) => s + (parseFloat(r.rowAmt.replace(',', '.')) || 0) * r.vatPct / 100, 0);
    const vp = rowNetTotal > 0 ? Math.round(rowVatTotal / rowNetTotal * 1000) / 10 : 0;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const dateStr = selectedDate.toISOString().split('T')[0];

    // Upload receipt image to Supabase Storage
    let receipt_url: string | undefined;
    if (imageUri) {
      try {
        const base64 = await FileSystem.readAsStringAsync(imageUri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        const filename = `receipts/${Date.now()}.jpg`;
        const { error: uploadError } = await supabase.storage
          .from('receipts')
          .upload(filename, decode(base64), { contentType: 'image/jpeg' });
        if (!uploadError) {
          const { data: urlData } = supabase.storage.from('receipts').getPublicUrl(filename);
          receipt_url = urlData?.publicUrl;
          track('receipt_uploaded', {
            mime_type: 'image/jpeg',
            size_kb: Math.round(base64.length * 3 / 4 / 1024),
          });
        } else {
          console.log('⚠️ Receipt upload failed:', uploadError.message);
        }
      } catch (e: any) {
        console.log('⚠️ Receipt upload error:', e?.message);
      }
    }

    const savedVatRows = vatRows.length >= 2
      ? vatRows.map(r => ({ vatRate: r.vatPct, grossAmountCents: toCents(parseFloat(r.rowAmt.replace(',', '.')) || 0) }))
      : undefined;
    onSave({ id: generateId(), type: 'expense', amountCents: toCents(amt), description: desc.trim(), category, veroCategory: getVeroCategory(category, 'expense'), date: dateStr, vatRate: vp, vatRows: savedVatRows, note: note || undefined, receipt_url });
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: COLORS.background }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={[modalStyles.header, { paddingTop: insets.top + 16 }]}>
          <Pressable onPress={onClose}><Text style={modalStyles.cancel}>{t('cancel')}</Text></Pressable>
          <Text style={{ color: COLORS.text, fontWeight: '600', fontSize: 15 }}>{t('reviewReceipt')}</Text>
          <Pressable onPress={handleSave} disabled={saveDisabled}><Text style={[modalStyles.save, { color: saveDisabled ? COLORS.muted : COLORS.danger }]}>{t('save')}</Text></Pressable>
        </View>
        <ScrollView style={modalStyles.body} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {/* Receipt image + scanning overlay */}
          {imageUri && (
            <View style={{ borderRadius: 12, overflow: 'hidden', marginBottom: 14, height: 200, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border }}>
              <Image source={{ uri: imageUri }} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
              {scanning && (
                <View style={{ ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                  <ActivityIndicator color={COLORS.primary} size="large" />
                  <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600', letterSpacing: 0.5 }}>
                    {t('scanningReceipt') || 'Skannataan kuitti…'}
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* OCR confidence badge */}
          {confidence !== null && !scanning && (
            <View style={{
              flexDirection: 'row', alignItems: 'center', gap: 6,
              backgroundColor: confidence > 0.8 ? COLORS.successDim ?? (COLORS.success + '18') : COLORS.warningDim,
              borderRadius: 10, padding: 10, marginBottom: 8,
            }}>
              <Feather
                name={confidence > 0.8 ? 'check-circle' : 'alert-triangle'}
                size={14}
                color={confidence > 0.8 ? COLORS.success : COLORS.warning}
              />
              <Text style={{ color: confidence > 0.8 ? COLORS.success : COLORS.warning, fontSize: 12, fontWeight: '600', flex: 1 }}>
                {confidence > 0.8
                  ? (t('ocrHighConfidence') || `✅ Tunnistettu (${Math.round(confidence * 100)}%) — tarkista tiedot`)
                  : (t('ocrLowConfidence') || `⚠️ Matala luotettavuus (${Math.round(confidence * 100)}%) — täytä puuttuvat kentät`)}
              </Text>
            </View>
          )}

          {/* OCR error */}
          {scanError && !scanning && (
            <View style={{ backgroundColor: COLORS.dangerDim ?? (COLORS.danger + '18'), borderRadius: 10, padding: 10, marginBottom: 8, flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              <Feather name="x-circle" size={14} color={COLORS.danger} />
              <Text style={{ color: COLORS.danger, fontSize: 12, flex: 1 }}>
                {t('ocrFailed') || 'Skannaus epäonnistui — täytä kentät itse'}
              </Text>
            </View>
          )}

          {/* Manual-fill hint (shown when no scan result yet and not scanning) */}
          {confidence === null && !scanning && !scanError && (
            <View style={{ backgroundColor: COLORS.warningDim, borderRadius: 10, padding: 10, marginBottom: 14, flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              <Feather name="info" size={14} color={COLORS.warning} />
              <Text style={{ color: COLORS.warning, fontSize: 12, flex: 1, lineHeight: 17 }}>
                {t('reviewReceiptHint')}
              </Text>
            </View>
          )}

          <Text style={modalStyles.label}>{t('vendorDescription')}</Text>
          <TextInput style={modalStyles.input} placeholder="e.g. Kesko, Shell, Amazon" placeholderTextColor={COLORS.muted} value={desc} onChangeText={setDesc} />

          <View style={modalStyles.twoCol}>
            <View style={modalStyles.colHalf}>
              <Text style={modalStyles.label}>{t('netAmount')}</Text>
              <TextInput style={modalStyles.input} placeholder="0.00" placeholderTextColor={COLORS.muted} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" />
              {saveDisabled && !scanning && (
                <Text style={{ color: COLORS.danger, fontSize: 11, marginTop: 4 }}>Please enter a valid amount</Text>
              )}
            </View>
            <View style={modalStyles.colHalf}>
              <Text style={modalStyles.label}>{t('date')}</Text>
              <Pressable
                style={[modalStyles.input, { justifyContent: 'center' }]}
                onPress={() => setShowDatePicker(true)}
              >
                <Text style={{ color: COLORS.primary, fontSize: 13, fontWeight: '700' }}>
                  {selectedDate.toLocaleDateString('fi-FI')}
                </Text>
              </Pressable>
              {showDatePicker && (
                <DatePickerModal
                  visible={showDatePicker}
                  value={selectedDate.toISOString().split('T')[0]}
                  onConfirm={d => { setSelectedDate(new Date(d + 'T12:00:00')); setShowDatePicker(false); }}
                  onCancel={() => setShowDatePicker(false)}
                  title={t('date')}
                />
              )}
            </View>
          </View>

          {/* VAT breakdown table */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <Text style={modalStyles.label}>{t('vatPresets')}</Text>
            <Pressable
              onPress={() => {
                const remaining = amtNum > 0 ? Math.max(0, amtNum - rowTotal) : 0;
                setVatRows(prev => [...prev, { id: generateId(), rowAmt: remaining > 0 ? remaining.toFixed(2) : '', vatPct: -1 }]);
              }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, backgroundColor: COLORS.primaryDim, borderWidth: 1, borderColor: COLORS.primary + '40' }}
            >
              <Feather name="plus" size={11} color={COLORS.primary} />
              <Text style={{ fontSize: 11, fontWeight: '700', color: COLORS.primary }}>Add Row</Text>
            </Pressable>
          </View>
          {vatRows.map((row, idx) => (
            <View key={row.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <TextInput
                style={[modalStyles.input, { flex: 1, marginBottom: 0 }]}
                placeholder="0.00"
                placeholderTextColor={COLORS.muted}
                value={row.rowAmt}
                onChangeText={v => setVatRows(prev => prev.map((r, i) => i === idx ? { ...r, rowAmt: v } : r))}
                keyboardType="decimal-pad"
              />
              <View style={{ flexDirection: 'row', gap: 4 }}>
                {VAT_PRESETS.map(pct => (
                  <Pressable
                    key={pct}
                    onPress={() => { setVatRows(prev => prev.map((r, i) => i === idx ? { ...r, vatPct: pct } : r)); Haptics.selectionAsync(); }}
                    style={{ paddingHorizontal: 8, paddingVertical: 6, borderRadius: 10, borderWidth: 1, backgroundColor: row.vatPct === pct ? COLORS.primary : COLORS.surface, borderColor: row.vatPct === pct ? COLORS.primary : COLORS.border }}
                  >
                    <Text style={{ fontSize: 11, fontWeight: '700', color: row.vatPct === pct ? COLORS.background : COLORS.muted }}>{pct}%</Text>
                  </Pressable>
                ))}
              </View>
              {vatRows.length > 1 && (
                <Pressable onPress={() => setVatRows(prev => prev.filter((_, i) => i !== idx))} style={{ padding: 4 }}>
                  <Feather name="minus-circle" size={18} color={COLORS.danger} />
                </Pressable>
              )}
            </View>
          ))}
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 6, marginBottom: 14, paddingHorizontal: 2 }}>
            <Text style={{ fontSize: 11, color: COLORS.muted }}>Row total:</Text>
            <Text style={{ fontSize: 13, fontWeight: '700', color: vatRows.length === 1 ? COLORS.muted : rowMismatch ? COLORS.danger : COLORS.success }}>
              {rowTotal.toFixed(2)}
            </Text>
            {vatRows.length > 1 && rowMismatch && (
              <Text style={{ fontSize: 11, color: COLORS.danger }}>≠ {amtNum.toFixed(2)}</Text>
            )}
          </View>

          <Text style={modalStyles.label}>{t('category')}</Text>
          <Pressable
            style={[modalStyles.catField, { borderColor: COLORS.danger + '60' }]}
            onPress={() => setShowCatSheet(true)}
          >
            <Feather name={getCatIcon(category) as any} size={16} color={COLORS.danger} />
            <Text style={[modalStyles.catFieldLabel, { color: COLORS.text, flex: 1 }]}>{catLabel(category, t)}</Text>
            <Feather name="chevron-down" size={14} color={COLORS.muted} />
          </Pressable>

          <Text style={modalStyles.label}>{t('note')}</Text>
          <TextInput style={[modalStyles.input, { height: 72, textAlignVertical: 'top', paddingTop: 10 }]} placeholder={t('note')} placeholderTextColor={COLORS.muted} value={note} onChangeText={setNote} multiline />
          <View style={{ height: 24 }} />
        </ScrollView>

        {/* Category bottom sheet */}
        <Modal visible={showCatSheet} transparent animationType="slide" onRequestClose={() => setShowCatSheet(false)}>
          <View style={{ flex: 1, justifyContent: 'flex-end' }}>
            <Pressable style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.85)' }]} onPress={() => setShowCatSheet(false)} />
            <View style={[modalStyles.sheet, { paddingBottom: insets.bottom + 16 }]}>
              <View style={modalStyles.sheetHandle} />
              <Text style={modalStyles.sheetTitle}>{t('category')}</Text>
              <View style={modalStyles.sheetSearchWrap}>
                <Feather name="search" size={14} color={COLORS.muted} />
                <TextInput
                  style={modalStyles.sheetSearchInput}
                  placeholder={t('search') || 'Search…'}
                  placeholderTextColor={COLORS.muted}
                  value={catSearch}
                  onChangeText={setCatSearch}
                  autoCorrect={false}
                />
              </View>
              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                {EXPENSE_CATEGORIES
                  .filter(c => catSearch === '' || catLabel(c.id, t).toLowerCase().includes(catSearch.toLowerCase()))
                  .map(c => {
                    const selected = category === c.id;
                    return (
                      <Pressable
                        key={c.id}
                        style={[modalStyles.sheetItem, selected && { backgroundColor: COLORS.danger + '15' }]}
                        onPress={() => {
                          setCategory(c.id); setCatSearch(''); setShowCatSheet(false); Haptics.selectionAsync();
                        }}
                      >
                        <Feather name={c.icon as any} size={16} color={selected ? COLORS.danger : COLORS.muted} />
                        <Text style={[modalStyles.sheetItemText, selected && { color: COLORS.danger, fontWeight: '600' }]}>
                          {catLabel(c.id, t)}
                        </Text>
                        {selected && <Feather name="check" size={15} color={COLORS.danger} />}
                      </Pressable>
                    );
                  })}
              </ScrollView>
            </View>
          </View>
        </Modal>

        {/* Custom category input */}
        <Modal visible={showCustomInput} transparent animationType="fade" onRequestClose={() => setShowCustomInput(false)}>
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, backgroundColor: 'rgba(0,0,0,0.85)' }}>
            <Pressable style={modalStyles.customInputBox} onPress={e => e.stopPropagation()}>
              <Text style={modalStyles.customInputTitle}>{t('customCategory')}</Text>
              <TextInput
                style={modalStyles.customInputField}
                placeholder={t('enterCategoryName')}
                placeholderTextColor={COLORS.muted}
                value={customInputText}
                onChangeText={setCustomInputText}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={() => {
                  const name = customInputText.trim();
                  setCategory(name || 'other');
                  setShowCustomInput(false);
                  Haptics.selectionAsync();
                }}
              />
              <View style={modalStyles.customInputBtns}>
                <Pressable style={modalStyles.customInputCancel} onPress={() => { setCategory('other'); setShowCustomInput(false); }}>
                  <Text style={modalStyles.customInputCancelText}>{t('cancel')}</Text>
                </Pressable>
                <Pressable style={[modalStyles.customInputConfirm, { backgroundColor: COLORS.danger }]} onPress={() => {
                  const name = customInputText.trim();
                  setCategory(name || 'other');
                  setShowCustomInput(false);
                  Haptics.selectionAsync();
                }}>
                  <Text style={modalStyles.customInputConfirmText}>{t('save')}</Text>
                </Pressable>
              </View>
            </Pressable>
          </View>
        </Modal>

      {dialog}
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── CSV Import Modal ─────────────────────────────────────────────────────────

type CsvMapping = { desc: string; amount: string; date: string; category: string };
type CsvStep = 'idle' | 'map' | 'preview';

interface CsvImportModalProps {
  visible: boolean;
  type: TransactionType;
  onClose: () => void;
  onBulkSave: (txs: Transaction[]) => void;
  t: (k: string) => string;
}

// Clean PapaParse auto-generated column names like _0, _1 → Column 1, Column 2
function cleanColName(h: string, idx: number): string {
  return /^_\d+$/.test(h) || !h.trim() ? `Column ${idx + 1}` : h;
}

function CsvImportModal({ visible, type, onClose, onBulkSave, t }: CsvImportModalProps) {
  const modalStyles = makeModalStyles();
  const csvStyles = makeCsvStyles();
  const insets = useSafeAreaInsets();
  const { show: showDialog, dialog: csvDialog } = useAppDialog();
  const { track } = useAnalytics();
  const [step, setStep] = useState<CsvStep>('idle');
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);        // raw CSV keys
  const [displayHeaders, setDisplayHeaders] = useState<string[]>([]); // cleaned for display
  const [mapping, setMapping] = useState<CsvMapping>({ desc: '', amount: '', date: '', category: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [openField, setOpenField] = useState<keyof CsvMapping | null>(null);
  const [reviewTxs, setReviewTxs] = useState<Transaction[] | null>(null);
  const [currency, setCurrency] = useState<Currency>('EUR');

  useEffect(() => {
    getSettings().then(s => setCurrency(s.currency));
  }, []);

  const reset = () => {
    setStep('idle'); setRows([]); setHeaders([]); setDisplayHeaders([]);
    setMapping({ desc: '', amount: '', date: '', category: '' });
    setError(''); setLoading(false); setOpenField(null); setReviewTxs(null);
  };
  useEffect(() => { if (!visible) reset(); }, [visible]);

  const pickFile = async () => {
    if (!DocumentPicker || !Papa) {
      Alert.alert(
        'Packages not installed',
        'Run in your project terminal:\nnpx expo install expo-document-picker\nnpm install papaparse @types/papaparse'
      );
      return;
    }
    setLoading(true); setError('');
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'text/comma-separated-values', 'application/csv', 'text/plain', '*/*'],
        copyToCacheDirectory: true,
      });
      if (res.canceled) { setLoading(false); return; }
      const file = res.assets[0];
      const text = await fetch(file.uri).then(r => r.text());
      const parsed = Papa.parse(text, { header: true, skipEmptyLines: true, delimiter: '' });
      if (!parsed.data || (parsed.data as any[]).length === 0) {
        setError('No data rows found. Make sure the file has a header row and data rows.');
        setLoading(false); return;
      }
      const hdrs: string[] = parsed.meta?.fields ?? [];
      if (hdrs.length === 0) { setError('Could not detect column headers.'); setLoading(false); return; }
      const disp = hdrs.map(cleanColName);
      setRows(parsed.data as Record<string, string>[]);
      setHeaders(hdrs);
      setDisplayHeaders(disp);
      // Auto-detect likely columns by raw header name
      const lower = hdrs.map((h: string) => h.toLowerCase());
      const findCol = (...candidates: string[]) => hdrs[lower.findIndex(h => candidates.some(c => h.includes(c)))] ?? '';
      setMapping({
        desc:     findCol('desc', 'title', 'name', 'merchant', 'vendor', 'saaja', 'maksaja', 'selite'),
        amount:   findCol('amount', 'sum', 'price', 'total', 'value', 'summa', 'määrä', 'belopp'),
        date:     findCol('date', 'time', 'päivä', 'datum', 'kirjauspäivä', 'arvopäivä'),
        category: findCol('category', 'type', 'kategoria', 'luokka', 'typ'),
      });
      setStep('map');
    } catch (e: any) {
      setError('Failed to read file: ' + (e?.message ?? 'Unknown error'));
    }
    setLoading(false);
  };

  const handlePdfImport = async () => {
    if (!DocumentPicker) {
      showDialog('Package missing', 'expo-document-picker is required.');
      return;
    }
    setLoading(true);
    setError('');

    try {
      console.log('📄 Starting PDF import process');

      // Step 1: Pick PDF file
      const res = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        copyToCacheDirectory: true,
      });

      if (res.canceled) {
        setLoading(false);
        return;
      }

      console.log('✅ PDF selected:', res.assets[0].name);

      // Step 2: Send PDF to parser service
      console.log('🔄 Converting PDF to base64...');

      const pdfBase64 = await FileSystem.readAsStringAsync(res.assets[0].uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      console.log('📄 PDF base64 size:', pdfBase64.length, 'characters');

      // Detect bank type from filename (server will auto-detect from content if wrong)
      const filename = res.assets[0].name?.toLowerCase() || '';
      let bankId = 'nordea'; // default to nordea (most common)
      if (filename.includes('nordea')) {
        bankId = 'nordea';
      } else if (filename.includes('op') || filename.includes('osuuspankki') || filename.match(/statement\d{6}/)) {
        // OP statements often named like "statement202603.PDF"
        bankId = 'op';
      }

      // Call PDF parser service
      const parseResponse = await fetch('https://scandinordic-mobile-clean-production.up.railway.app/parse', { // Change after Railway deployment
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Parser-Secret': process.env.EXPO_PUBLIC_PARSER_SECRET ?? ''
        },
        body: JSON.stringify({
          pdf: pdfBase64,
          bankId: bankId
        })
      });

      if (!parseResponse.ok) {
        throw new Error(`Parser service error: ${parseResponse.status}`);
      }

      const parseResult = await parseResponse.json();

      if (!parseResult.success) {
        throw new Error(`Parser error: ${parseResult.error}`);
      }

      console.log('📝 Parser service result:', parseResult);

      // Convert parser result to app format with auto-categorization
      const transactions: Transaction[] = parseResult.transactions.map((tx: any) => {
        const txType = tx.type as TransactionType;
        // Auto-detect category from description, fallback to default
        const detectedCategory = detectCategory(tx.description, txType);
        const category = detectedCategory || (txType === 'income' ? 'other_income' : 'unclassified');

        return {
          id: generateId(),
          type: txType,
          amount: Math.abs(tx.amountCents),
          description: tx.description,
          category,
          veroCategory: getVeroCategory(category, txType),
          date: tx.date,
          vatRate: txType === 'income' ? 0 : 25.5,
          note: undefined,
        };
      });

      console.log(`✅ Converted ${transactions.length} transactions`);

      // Show confirmation dialog
      const incomeCount = transactions.filter(t => t.type === 'income').length;
      const expenseCount = transactions.filter(t => t.type === 'expense').length;

      // Use detected bank from server (may differ from filename guess)
      const actualBank = parseResult.detectedBank || parseResult.bankId || bankId;
      const bankLabel = parseResult.bankMismatch
        ? `${actualBank.toUpperCase()} Bank (auto-corrected from ${bankId.toUpperCase()})`
        : `${actualBank.toUpperCase()} Bank`;

      console.log(`📋 Opening review modal for ${transactions.length} transactions`);
      setReviewTxs(transactions);
      return;

    } catch (e: any) {
      console.log('❌ PDF import error:', e?.message);

      // Check if it's a known PDF conversion issue
      if (e?.message?.includes('PDF format not supported') || e?.message?.includes('requires image conversion')) {
        setError('PDF import is currently being improved. Try these alternatives:\n\n📸 Tap "Scan Receipt" to take a photo\n🖼️ Tap "Upload Image" to select a photo\n\nWe\'re working on full PDF support!');
      } else {
        setError('PDF import failed: ' + (e?.message ?? 'Unknown error'));
      }
    } finally {
      setLoading(false);
    }
  };

  // Get up to 3 non-empty sample values for a raw column key
  const getSamples = (col: string): string => {
    const vals = rows.slice(0, 10).map(r => (r[col] || '').trim()).filter(Boolean);
    return vals.slice(0, 3).join('  ·  ') || '—';
  };

  const canPreview = !!mapping.desc && !!mapping.amount;

  const importAll = async () => {
    const txs = (rows as Record<string, string>[])
      .map((row): Transaction | null => {
        const signedAmt = parseSignedAmount(row[mapping.amount] ?? '');
        if (signedAmt === 0) return null;
        const txType: TransactionType = signedAmt < 0 ? 'expense' : 'income';
        const amt = Math.abs(signedAmt);
        const desc = (row[mapping.desc] ?? '').trim() || (txType === 'income' ? 'Imported income' : 'Imported expense');
        const csvCat = mapping.category && row[mapping.category] ? row[mapping.category].trim().toLowerCase() : '';
        const catId = csvCat || detectCategory(desc, txType) || (txType === 'income' ? 'consulting_services' : 'fuel');
        return {
          id: generateId(),
          type: txType,
          amountCents: toCents(amt),
          description: desc,
          category: catId,
          veroCategory: getVeroCategory(catId, txType),
          date: parseCsvDate(row[mapping.date] ?? ''),
          vatRate: 0,
        };
      })
      .filter((tx): tx is Transaction => tx !== null);

    if (txs.length === 0) {
      showDialog('No valid rows', 'Could not parse any rows with a valid amount.');
      return;
    }
    const incomeCount  = txs.filter(tx => tx.type === 'income').length;
    const expenseCount = txs.filter(tx => tx.type === 'expense').length;
    const idx = await showDialog(
      `Import ${txs.length} transactions?`,
      `${incomeCount} income, ${expenseCount} expense. Type auto-detected from amount sign. 0% VAT.`,
      [{ text: t('cancel'), style: 'cancel' }, { text: `Import ${txs.length}` }]
    );
    if (idx === 1) { onBulkSave(txs); onClose(); }
  };

  const previewRows = rows.slice(0, 5);

  const FIELD_LABELS: Record<keyof CsvMapping, string> = {
    desc: t('description') + ' *',
    amount: t('amount') + ' *',
    date: t('date'),
    category: t('category'),
  };

  return (
    <>
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: COLORS.background }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        {/* Header */}
        <View style={[modalStyles.header, { paddingTop: insets.top + 16 }]}>
          <Pressable onPress={step === 'idle' ? onClose : () => { setOpenField(null); setStep(step === 'preview' ? 'map' : 'idle'); }}>
            <Text style={modalStyles.cancel}>{step === 'idle' ? t('cancel') : '← Back'}</Text>
          </Pressable>
          <Text style={{ color: COLORS.text, fontWeight: '600', fontSize: 15 }}>
            {step === 'idle' ? t('csvImport') : step === 'map' ? t('mapColumns') : t('preview')}
          </Text>
          {step === 'map' ? (
            <Pressable onPress={() => { if (canPreview) { setOpenField(null); setStep('preview'); } }} disabled={!canPreview}>
              <Text style={[modalStyles.save, { color: canPreview ? COLORS.primary : COLORS.muted }]}>
                {t('preview')} →
              </Text>
            </Pressable>
          ) : step === 'preview' ? (
            <Pressable onPress={importAll}>
              <Text style={[modalStyles.save, { color: COLORS.success }]}>Import {rows.length}</Text>
            </Pressable>
          ) : (
            <View style={{ width: 60 }} />
          )}
        </View>

        <ScrollView style={modalStyles.body} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

          {/* ── Idle: file picker ── */}
          {step === 'idle' && (
            <View style={{ alignItems: 'center', gap: 20, paddingTop: 40 }}>
              <View style={{ width: 80, height: 80, borderRadius: 20, backgroundColor: COLORS.successDim, alignItems: 'center', justifyContent: 'center' }}>
                <Feather name="file-text" size={36} color={COLORS.success} />
              </View>
              <Text style={{ color: COLORS.text, fontSize: 20, fontWeight: '700' }}>Import CSV</Text>
              <Text style={{ color: COLORS.muted, fontSize: 13, textAlign: 'center', lineHeight: 20, maxWidth: 280 }}>
                Select a CSV file exported from your bank or accounting software.{'\n'}
                Comma and semicolon delimiters are both supported.
              </Text>
              {!!error && (
                <View style={{ backgroundColor: COLORS.dangerDim, borderRadius: 10, padding: 12, width: '100%', flexDirection: 'row', gap: 8 }}>
                  <Feather name="alert-circle" size={14} color={COLORS.danger} />
                  <Text style={{ color: COLORS.danger, fontSize: 12, flex: 1 }}>{error}</Text>
                </View>
              )}
              {loading
                ? <ActivityIndicator color={COLORS.primary} size="large" />
                : (
                  <View style={{ flexDirection: 'row', gap: 12 }}>
                    <Pressable
                      style={{ flex: 1, backgroundColor: COLORS.primary, paddingHorizontal: 24, paddingVertical: 14, borderRadius: 14, alignItems: 'center' }}
                      onPress={pickFile}
                    >
                      <Text style={{ color: COLORS.background, fontWeight: '700', fontSize: 15 }}>{t('selectCsvFile')}</Text>
                    </Pressable>
                    <Pressable
                      style={{ flex: 1, backgroundColor: COLORS.card, paddingHorizontal: 24, paddingVertical: 14, borderRadius: 14, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border }}
                      onPress={handlePdfImport}
                    >
                      <Text style={{ color: COLORS.primary, fontWeight: '700', fontSize: 15 }}>Import PDF</Text>
                    </Pressable>
                  </View>
                )
              }
              <View style={{ backgroundColor: COLORS.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: COLORS.border, width: '100%', gap: 6 }}>
                <Text style={{ color: COLORS.muted, fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, fontWeight: '600' }}>Expected format</Text>
                <Text style={{ color: COLORS.textSecondary, fontSize: 11, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' }}>
                  Date,Description,Amount,Category{'\n'}
                  2024-01-15,Shell fuel,45.50,fuel{'\n'}
                  2024-01-16,Kesko,12.80,groceries
                </Text>
              </View>
            </View>
          )}

          {/* ── Map: dropdown per field ── */}
          {step === 'map' && (
            <>
              <View style={csvStyles.mapBanner}>
                <Feather name="columns" size={12} color={COLORS.primary} />
                <Text style={csvStyles.mapBannerText}>
                  {displayHeaders.length} columns · {rows.length} rows · Map required (*) fields then tap Preview
                </Text>
              </View>

              {(Object.keys(FIELD_LABELS) as (keyof CsvMapping)[]).map(field => {
                const isOpen = openField === field;
                const selectedRaw = mapping[field];
                const selectedIdx = headers.indexOf(selectedRaw);
                const selectedDisplay = selectedIdx >= 0 ? displayHeaders[selectedIdx] : null;
                const isRequired = field === 'desc' || field === 'amount';
                const isMapped = !!selectedRaw;

                return (
                  <View key={field} style={csvStyles.dropWrapper}>
                    {/* Trigger button */}
                    <Pressable
                      style={[csvStyles.dropTrigger, isOpen && csvStyles.dropTriggerOpen, isMapped && !isOpen && csvStyles.dropTriggerMapped]}
                      onPress={() => setOpenField(isOpen ? null : field)}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={csvStyles.dropFieldLabel}>{FIELD_LABELS[field]}</Text>
                        <Text style={[csvStyles.dropSelectedText, !selectedDisplay && { color: COLORS.muted, fontStyle: 'italic' }]}>
                          {selectedDisplay ?? (isRequired ? 'Select column…' : 'Skip (optional)')}
                        </Text>
                      </View>
                      <Feather name={isOpen ? 'chevron-up' : 'chevron-down'} size={16} color={isMapped ? COLORS.primary : COLORS.muted} />
                    </Pressable>

                    {/* Expanded options list */}
                    {isOpen && (
                      <View style={csvStyles.dropList}>
                        {!isRequired && (
                          <Pressable
                            style={[csvStyles.dropOption, !mapping[field] && csvStyles.dropOptionActive]}
                            onPress={() => { setMapping(m => ({ ...m, [field]: '' })); setOpenField(null); }}
                          >
                            <Text style={[csvStyles.dropOptionTitle, !mapping[field] && { color: COLORS.primary }]}>
                              — Skip (optional) —
                            </Text>
                          </Pressable>
                        )}
                        {headers.map((h, i) => {
                          const active = mapping[field] === h;
                          return (
                            <Pressable
                              key={h}
                              style={[csvStyles.dropOption, active && csvStyles.dropOptionActive]}
                              onPress={() => { setMapping(m => ({ ...m, [field]: h })); setOpenField(null); }}
                            >
                              <View style={csvStyles.dropOptionRow}>
                                <Text style={[csvStyles.dropOptionTitle, active && { color: COLORS.primary }]}>
                                  {displayHeaders[i]}
                                </Text>
                                {active && <Feather name="check" size={14} color={COLORS.primary} />}
                              </View>
                              <Text style={csvStyles.dropOptionSample} numberOfLines={1}>
                                {getSamples(h)}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    )}

                    {/* Inline sample preview when mapped & closed */}
                    {!isOpen && selectedDisplay && (
                      <View style={csvStyles.sampleBar}>
                        <Feather name="eye" size={10} color={COLORS.muted} />
                        <Text style={csvStyles.sampleBarText} numberOfLines={1}>
                          {getSamples(selectedRaw)}
                        </Text>
                      </View>
                    )}
                  </View>
                );
              })}

              {!canPreview && (
                <View style={csvStyles.requiredNote}>
                  <Feather name="alert-circle" size={12} color={COLORS.warning} />
                  <Text style={csvStyles.requiredNoteText}>Map Description and Amount to enable Preview</Text>
                </View>
              )}
            </>
          )}

          {/* ── Preview: table ── */}
          {step === 'preview' && (
            <>
              <Text style={csvStyles.hint}>First {previewRows.length} of {rows.length} rows · Zero-amount rows will be skipped on import.</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator>
                <View>
                  <View style={[csvStyles.tableRow, { backgroundColor: COLORS.card }]}>
                    {[t('description'), t('amount'), t('date'), t('category')].map(h => (
                      <Text key={h} style={csvStyles.tableHeader}>{h}</Text>
                    ))}
                  </View>
                  {previewRows.map((row, i) => (
                    <View key={i} style={[csvStyles.tableRow, i % 2 === 1 && { backgroundColor: COLORS.card + 'AA' }]}>
                      <Text style={csvStyles.tableCell} numberOfLines={1}>{(mapping.desc && row[mapping.desc]) || '—'}</Text>
                      <Text style={[csvStyles.tableCell, { color: COLORS.danger }]}>{(mapping.amount && row[mapping.amount]) || '—'}</Text>
                      <Text style={csvStyles.tableCell}>{(mapping.date && row[mapping.date]) || '—'}</Text>
                      <Text style={csvStyles.tableCell}>{(mapping.category && row[mapping.category]) || '—'}</Text>
                    </View>
                  ))}
                </View>
              </ScrollView>
              {rows.length > 5 && (
                <Text style={{ color: COLORS.muted, fontSize: 11, textAlign: 'center', marginTop: 8 }}>
                  + {rows.length - 5} more rows
                </Text>
              )}
              <View style={{ marginTop: 20, backgroundColor: COLORS.infoDim, borderRadius: 10, padding: 12, flexDirection: 'row', gap: 8 }}>
                <Feather name="info" size={14} color={COLORS.info} />
                <Text style={{ color: COLORS.info, fontSize: 12, flex: 1, lineHeight: 17 }}>
                  Positive amounts → income, negative → expense. Category auto-detected from description. All rows imported with 0% VAT.
                </Text>
              </View>
            </>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
        {csvDialog}
      </KeyboardAvoidingView>
    </Modal>

    <PDFReviewModal
      visible={reviewTxs !== null}
      transactions={reviewTxs ?? []}
      currency={currency}
      onConfirm={(confirmed) => {
        track('transaction_imported', { source: 'pdf', count: confirmed.length });
        onBulkSave(confirmed);
        onClose();
      }}
      onCancel={() => setReviewTxs(null)}
    />
    </>
  );
}

// ─── Modal Styles ─────────────────────────────────────────────────────────────

const makeModalStyles = () => StyleSheet.create({
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingBottom: 16,
    borderBottomWidth: 1, borderColor: COLORS.border,
  },
  cancel: { fontSize: 15, color: COLORS.textSecondary },
  save: { fontSize: 15, fontWeight: '600' },
  modalTitle: { fontSize: 15, fontWeight: '700', letterSpacing: -0.3 },
  body: { padding: 20 },
  label: {
    fontSize: 10, fontWeight: '600', color: COLORS.muted,
    textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, marginTop: 4,
  },
  input: {
    backgroundColor: COLORS.card, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border,
    color: COLORS.text, fontSize: 14, paddingHorizontal: 14, height: 50, marginBottom: 14,
  },
  toggleRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: COLORS.card, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border,
    paddingHorizontal: 14, paddingVertical: 12, marginBottom: 14,
  },
  toggleLabel: { fontSize: 13, fontWeight: '500', color: COLORS.text },
  twoCol: { flexDirection: 'row', gap: 10, marginBottom: 4 },
  colHalf: { flex: 1 },
  statusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 14 },
  vatPresetsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14, alignItems: 'center' },
  vatCustomInput: {
    height: 38, minWidth: 70, flex: 1,
    backgroundColor: COLORS.card, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border,
    color: COLORS.text, fontSize: 13, paddingHorizontal: 10,
  },
  breakdown: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  breakdownCard: {
    flex: 1, backgroundColor: COLORS.card, borderRadius: 10,
    borderWidth: 1, borderColor: COLORS.border, padding: 10, gap: 4,
  },
  breakdownLabel: { fontSize: 9, color: COLORS.muted, textTransform: 'uppercase', letterSpacing: 0.8 },
  breakdownValue: { fontSize: 13, fontWeight: '700', color: COLORS.text },
  chip: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20,
    borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.card,
  },
  chipText: { fontSize: 12, fontWeight: '500', color: COLORS.textSecondary },
  typeToggle: { flexDirection: 'row', gap: 6 },
  typeBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: COLORS.border },
  typeBtnText: { fontSize: 12, fontWeight: '600', color: COLORS.muted, textTransform: 'uppercase', letterSpacing: 0.5 },
  catField: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: COLORS.card, borderRadius: 12, borderWidth: 1,
    paddingHorizontal: 14, height: 50, marginBottom: 14,
  },
  catFieldLabel: { fontSize: 14, flex: 1 },
  sheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: {
    backgroundColor: COLORS.card, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: 20, paddingTop: 12, maxHeight: '70%',
    borderTopWidth: 1, borderColor: COLORS.border,
  },
  sheetHandle: {
    width: 38, height: 4, borderRadius: 2, backgroundColor: COLORS.border,
    alignSelf: 'center', marginBottom: 14,
  },
  sheetTitle: {
    fontSize: 13, fontWeight: '700', color: COLORS.text,
    textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12,
  },
  sheetSearchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: COLORS.input, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border,
    paddingHorizontal: 12, paddingVertical: 9, marginBottom: 10,
  },
  sheetSearchInput: { flex: 1, color: COLORS.text, fontSize: 13 },
  sheetItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 13, paddingHorizontal: 4,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  sheetItemText: { flex: 1, fontSize: 14, color: COLORS.text },
  customInputBox: {
    backgroundColor: COLORS.card, borderRadius: 20, borderWidth: 1, borderColor: COLORS.border,
    width: '100%', maxWidth: 340, padding: 24, gap: 14,
  },
  customInputTitle: {
    fontSize: 13, fontWeight: '700', color: COLORS.text,
    textTransform: 'uppercase', letterSpacing: 1, textAlign: 'center',
  },
  customInputField: {
    backgroundColor: COLORS.input, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border,
    color: COLORS.text, fontSize: 15, paddingHorizontal: 14, paddingVertical: 12,
  },
  customInputBtns: { flexDirection: 'row', gap: 10 },
  customInputCancel: {
    flex: 1, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border,
    paddingVertical: 13, alignItems: 'center',
  },
  customInputCancelText: { fontSize: 14, fontWeight: '600', color: COLORS.muted },
  customInputConfirm: {
    flex: 2, borderRadius: 12, paddingVertical: 13, alignItems: 'center',
  },
  customInputConfirmText: { fontSize: 14, fontWeight: '700', color: COLORS.background },
});

const makeCsvStyles = () => StyleSheet.create({
  hint: { fontSize: 11, color: COLORS.muted, marginBottom: 16, lineHeight: 16 },
  // Map step banner
  mapBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: COLORS.primaryDim, borderRadius: 10, padding: 12,
    borderWidth: 1, borderColor: COLORS.primary + '30', marginBottom: 20,
  },
  mapBannerText: { fontSize: 11, color: COLORS.primary, flex: 1, lineHeight: 16 },
  // Dropdown wrapper per field
  dropWrapper: { marginBottom: 14 },
  dropTrigger: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.card, borderRadius: 12,
    borderWidth: 1, borderColor: COLORS.border,
    paddingHorizontal: 14, paddingVertical: 12,
  },
  dropTriggerOpen: {
    borderBottomLeftRadius: 0, borderBottomRightRadius: 0,
    borderColor: COLORS.primary,
  },
  dropTriggerMapped: { borderColor: COLORS.primary + '60' },
  dropFieldLabel: {
    fontSize: 9, fontWeight: '700', color: COLORS.muted,
    textTransform: 'uppercase', letterSpacing: 1, marginBottom: 3,
  },
  dropSelectedText: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  dropList: {
    backgroundColor: COLORS.card,
    borderWidth: 1, borderTopWidth: 0, borderColor: COLORS.primary,
    borderBottomLeftRadius: 12, borderBottomRightRadius: 12,
    overflow: 'hidden',
  },
  dropOption: {
    paddingHorizontal: 14, paddingVertical: 11,
    borderTopWidth: 1, borderTopColor: COLORS.border,
  },
  dropOptionActive: { backgroundColor: COLORS.primaryDim },
  dropOptionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dropOptionTitle: { fontSize: 13, fontWeight: '500', color: COLORS.text },
  dropOptionSample: { fontSize: 10, color: COLORS.muted, marginTop: 3 },
  // Inline sample preview bar
  sampleBar: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 7,
    backgroundColor: COLORS.surface,
    borderWidth: 1, borderTopWidth: 0, borderColor: COLORS.primary + '40',
    borderBottomLeftRadius: 10, borderBottomRightRadius: 10,
  },
  sampleBarText: { fontSize: 11, color: COLORS.muted, flex: 1 },
  // Required note
  requiredNote: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: COLORS.warningDim, borderRadius: 8, padding: 10,
    borderWidth: 1, borderColor: COLORS.warning + '30', marginTop: 4,
  },
  requiredNoteText: { fontSize: 11, color: COLORS.warning, flex: 1 },
  // Preview table
  tableRow: { flexDirection: 'row', borderBottomWidth: 1, borderColor: COLORS.border },
  tableHeader: { width: 130, paddingHorizontal: 10, paddingVertical: 8, fontSize: 9, fontWeight: '700', color: COLORS.muted, textTransform: 'uppercase', letterSpacing: 0.8 },
  tableCell: { width: 130, paddingHorizontal: 10, paddingVertical: 8, fontSize: 12, color: COLORS.text },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function EarningsScreen() {
  const styles = makeStyles();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const { show: showDialog, dialog } = useAppDialog();
  const { action } = useLocalSearchParams<{ action?: string }>();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [invoiceCount, setInvoiceCount] = useState(0);
  const [currency, setCurrency] = useState<Currency>('EUR');
  const [activeTab, setActiveTab] = useState<TransactionType>('income');
  const [showModal, setShowModal] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Receipt review state
  const [reviewUri, setReviewUri] = useState<string | null>(null);
  const [reviewBase64, setReviewBase64] = useState<string | undefined>(undefined);
  const [showReview, setShowReview] = useState(false);
  // Fullscreen receipt viewer state
  const [receiptViewUrl, setReceiptViewUrl] = useState<string | null>(null);
  // CSV import state
  const [showCsv, setShowCsv] = useState(false);

  // Auto-open modal when navigated from Home quick-add buttons
  useEffect(() => {
    if (action === 'scan' || action === 'upload') {
      const openReceiptPicker = async () => {
        if (action === 'scan') {
          if (!ImagePicker) {
            Alert.alert('Not installed', 'Run in your project:\nnpx expo install expo-image-picker');
            return;
          }
          const perm = await ImagePicker.requestCameraPermissionsAsync();
          if (!perm.granted) {
            Alert.alert('Camera access denied', 'Please allow camera access in device Settings.');
            return;
          }
          try {
            const result = await ImagePicker.launchCameraAsync({
              mediaTypes: ['images'],
              quality: 0.5,
              allowsEditing: false,
              exif: false,
              base64: true,
            });
            if (!result.canceled && result.assets?.[0]) {
              const asset = result.assets[0];
              if (asset.base64) {
                console.log('✅ base64 available directly from ImagePicker');
                setReviewBase64(asset.base64);
              } else {
                console.log('⚠️ No base64 on asset. Available properties:', Object.keys(asset));
                setReviewBase64(undefined);
              }
              setReviewUri(asset.uri);
              setShowReview(true);
            }
          } catch (e: any) {
            Alert.alert('Camera error', e?.message ?? 'Could not open camera.');
          }
        } else {
          if (!DocumentPicker) return;
          const result = await DocumentPicker.getDocumentAsync({
            type: ['image/jpeg', 'image/png'],
            copyToCacheDirectory: true,
          });
          if (result.canceled) return;
          const fileUri = result.assets?.[0]?.uri;
          if (!fileUri) {
            Alert.alert('Error', 'Could not get file URI');
            return;
          }
          setReviewUri(fileUri);
          setShowReview(true);
        }
      };
      openReceiptPicker();
    } else if (action === 'csv') {
      setShowCsv(true);
    }
  }, [action]);

  const load = useCallback(async () => {
    const [tx, inv, s] = await Promise.all([getTransactions(), getInvoices(), getSettings()]);
    setTransactions(tx);
    setInvoiceCount(inv.length);
    setCurrency(s.currency);
  }, []);

  useEffect(() => { load(); }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const handleSave = async (tx: Transaction) => {
    await saveTransaction(tx);
    await load();
  };

  const handleBulkSave = async (txs: Transaction[]) => {
    for (const tx of txs) { await saveTransaction(tx); }
    await load();
    showDialog(t('importComplete'), `${txs.length} transactions imported successfully.`);
  };

  const handleDelete = async (id: string) => {
    const idx = await showDialog(t('delete'), t('removeThisTransaction'), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('delete'), style: 'destructive' },
    ]);
    if (idx === 1) { await deleteTransaction(id); await load(); }
  };

  // ── Receipt flows ──

  const handleScanReceipt = async () => {
    if (!ImagePicker) {
      Alert.alert('Not installed', 'Run in your project:\nnpx expo install expo-image-picker');
      return;
    }
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Camera access denied', 'Please allow camera access in device Settings.');
      return;
    }
    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 0.5,
        allowsEditing: false,
        exif: false,
        base64: true,
      });
      if (!result.canceled && result.assets?.[0]) {
        const asset = result.assets[0];
        if (asset.base64) {
          console.log('✅ base64 available directly from ImagePicker');
          setReviewBase64(asset.base64);
        } else {
          console.log('⚠️ No base64 on asset. Available properties:', Object.keys(asset));
          setReviewBase64(undefined);
        }
        setReviewUri(asset.uri);
        setShowReview(true);
      }
    } catch (e: any) {
      Alert.alert('Camera error', e?.message ?? 'Could not open camera.');
    }
  };

  const handleUploadReceipt = async () => {
    if (!ImagePicker) {
      Alert.alert('Not installed', 'Run in your project:\nnpx expo install expo-image-picker');
      return;
    }
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission denied', 'Please allow photo library access in device Settings.');
      return;
    }
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.5,
        allowsEditing: false,
        exif: false,
      });
      if (!result.canceled && result.assets?.[0]) {
        setReviewUri(result.assets[0].uri);
        setShowReview(true);
      }
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Could not open photo library.');
    }
  };

  // ── Derived data ──

  const now = new Date();

  const monthTx = useMemo(() => transactions.filter(tx => {
    const d = new Date(tx.date);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }), [transactions]);

  const yearTx = useMemo(() => transactions.filter(tx =>
    new Date(tx.date).getFullYear() === now.getFullYear()
  ), [transactions]);

  const totalIncomeAll = useMemo(() => transactions.filter(t => t.type === 'income').reduce((s, t) => addCents(s, t.amountCents), zeroCents()), [transactions]);
  const totalExpenseAll = useMemo(() => transactions.filter(t => t.type === 'expense').reduce((s, t) => addCents(s, t.amountCents), zeroCents()), [transactions]);

  const vatCollectedAll = useMemo(() => transactions.filter(t => t.type === 'income').reduce((s, t) => addCents(s, multiplyCents(t.amountCents, (t.vatRate || 0) / 100)), zeroCents()), [transactions]);
  const vatPaidAll = useMemo(() => transactions.filter(t => t.type === 'expense').reduce((s, t) => addCents(s, multiplyCents(t.amountCents, (t.vatRate || 0) / 100)), zeroCents()), [transactions]);
  const netVatAll = subtractCents(vatCollectedAll, vatPaidAll);

  const monthIncome = useMemo(() => monthTx.filter(t => t.type === 'income').reduce((s, t) => addCents(s, t.amountCents), zeroCents()), [monthTx]);
  const monthExpense = useMemo(() => monthTx.filter(t => t.type === 'expense').reduce((s, t) => addCents(s, t.amountCents), zeroCents()), [monthTx]);

  const yearIncome = useMemo(() => yearTx.filter(t => t.type === 'income').reduce((s, t) => addCents(s, t.amountCents), zeroCents()), [yearTx]);
  const yearExpense = useMemo(() => yearTx.filter(t => t.type === 'expense').reduce((s, t) => addCents(s, t.amountCents), zeroCents()), [yearTx]);

  const filtered = useMemo(() => transactions.filter(tx => tx.type === activeTab), [transactions, activeTab]);
  const tabColor = activeTab === 'income' ? COLORS.success : COLORS.danger;

  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editTx, setEditTx] = useState<Transaction | null>(null);

  useEffect(() => {
    setSelectMode(false);
    setSelectedIds(new Set());
  }, [activeTab]);

  const exitSelectMode = useCallback(() => {
    setSelectMode(false);
    setSelectedIds(new Set());
  }, []);

  const handleLongPress = useCallback((tx: Transaction) => {
    if (!selectMode) {
      setSelectMode(true);
      setSelectedIds(new Set([tx.id]));
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
  }, [selectMode]);

  const handleToggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    setSelectedIds(new Set(filtered.map(tx => tx.id)));
    Haptics.selectionAsync();
  }, [filtered]);

  const handleDeleteSelected = useCallback(async () => {
    const count = selectedIds.size;
    const idx = await showDialog(
      `Delete ${count} transaction${count !== 1 ? 's' : ''}?`,
      'This cannot be undone.',
      [{ text: t('cancel'), style: 'cancel' }, { text: t('delete'), style: 'destructive' }]
    );
    if (idx === 1) {
      await bulkDeleteTransactions([...selectedIds]);
      await load();
      exitSelectMode();
    }
  }, [selectedIds, t, showDialog, load, exitSelectMode]);

  const statCards = [
    { label: t('totalIncome'), value: formatCents(totalIncomeAll, currency), color: COLORS.success, icon: 'trending-up', onPress: () => setActiveTab('income') },
    { label: t('totalExpenses'), value: formatCents(totalExpenseAll, currency), color: COLORS.danger, icon: 'trending-down', onPress: () => setActiveTab('expense') },
    { label: t('invoicesLabel'), value: String(invoiceCount), color: COLORS.info, icon: 'file-text', onPress: () => router.push('/(tabs)/invoices') },
    { label: t('netVat'), value: formatCents(netVatAll, currency), color: COLORS.primary, icon: 'percent', onPress: () => router.push('/vat') },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
        contentContainerStyle={{ paddingBottom: insets.bottom + 110 }}
      >
        {/* Header */}
        <View style={[styles.headerBlock, { paddingTop: insets.top + 16 }]}>
          <Text style={styles.badge}>◆ ScandiNordic Pro ◆</Text>
          <View style={styles.headerRow}>
            <Text style={styles.title}>{t('earnings')}</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable
                style={[styles.addBtn, { backgroundColor: tabColor + '20', borderColor: tabColor }]}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowCsv(true); }}
              >
                <Feather name="file-text" size={16} color={tabColor} />
              </Pressable>
              <Pressable
                style={[styles.addBtn, { backgroundColor: tabColor + '20', borderColor: tabColor }]}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowModal(true); }}
              >
                <Feather name="plus" size={18} color={tabColor} />
              </Pressable>
            </View>
          </View>
          <View style={styles.divider} />
        </View>

        {/* 2×2 Stat Cards */}
        <View style={styles.grid}>
          {statCards.map(s => (
            <Pressable
              key={s.label}
              style={({ pressed }) => [styles.statCard, { borderBottomColor: s.color, borderBottomWidth: 2 }, pressed && { opacity: 0.75 }]}
              onPress={() => { Haptics.selectionAsync(); s.onPress(); }}
            >
              <Text style={styles.statLabel}>{s.label}</Text>
              <Text style={[styles.statValue, { color: s.color }]}>{s.value}</Text>
            </Pressable>
          ))}
        </View>

        {/* This Month */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>{t('thisMonth')}</Text>
          <View style={styles.summaryCard}>
            <SummaryCol label={t('income')} value={formatCents(monthIncome, currency)} color={COLORS.success} />
            <View style={styles.summaryDivider} />
            <SummaryCol label={t('expenses')} value={formatCents(monthExpense, currency)} color={COLORS.danger} />
            <View style={styles.summaryDivider} />
            <SummaryCol label={t('netProfit')} value={formatCents(subtractCents(monthIncome, monthExpense), currency)} color={monthIncome - monthExpense >= 0 ? COLORS.success : COLORS.danger} />
          </View>
        </View>

        {/* This Year */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>{t('thisYear')}</Text>
          <View style={styles.summaryCard}>
            <SummaryCol label={t('income')} value={formatCents(yearIncome, currency)} color={COLORS.success} />
            <View style={styles.summaryDivider} />
            <SummaryCol label={t('expenses')} value={formatCents(yearExpense, currency)} color={COLORS.danger} />
            <View style={styles.summaryDivider} />
            <SummaryCol label={t('netProfit')} value={formatCents(subtractCents(yearIncome, yearExpense), currency)} color={yearIncome - yearExpense >= 0 ? COLORS.success : COLORS.danger} />
          </View>
        </View>

        {/* Quick Actions */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>{t('quickAdd')}</Text>
          <View style={styles.actionRow}>
            <Pressable
              style={styles.actionCard}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); handleScanReceipt(); }}
            >
              <Feather name="camera" size={20} color={COLORS.primary} />
              <Text style={styles.actionLabel}>{t('scanReceipt')}</Text>
            </Pressable>
            <Pressable
              style={styles.actionCard}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); handleUploadReceipt(); }}
            >
              <Feather name="upload" size={20} color={COLORS.info} />
              <Text style={styles.actionLabel}>{t('uploadReceipt')}</Text>
            </Pressable>
          </View>
        </View>

        {/* Income / Expense Tabs + List */}
        <View style={styles.section}>
          <View style={styles.tabs}>
            {(['income', 'expense'] as TransactionType[]).map(tab => (
              <Pressable
                key={tab}
                style={[styles.tab, activeTab === tab && { borderBottomColor: tab === 'income' ? COLORS.success : COLORS.danger, borderBottomWidth: 2 }]}
                onPress={() => { setActiveTab(tab); Haptics.selectionAsync(); }}
              >
                <Text style={[styles.tabLabel, activeTab === tab && { color: tab === 'income' ? COLORS.success : COLORS.danger }]}>
                  {t(tab)}
                </Text>
              </Pressable>
            ))}
          </View>

          {filtered.length === 0 ? (
            <View style={styles.empty}>
              <Feather name="inbox" size={36} color={COLORS.muted} />
              <Text style={styles.emptyText}>{t('noTransactions')}</Text>
              <Pressable style={styles.emptyBtn} onPress={() => setShowModal(true)}>
                <Text style={styles.emptyBtnText}>{activeTab === 'income' ? t('addIncome') : t('addExpense')}</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.list}>
              {filtered.map(tx => (
                <TransactionItem
                  key={tx.id}
                  item={tx}
                  currency={currency}
                  selectMode={selectMode}
                  selected={selectedIds.has(tx.id)}
                  onPress={() => selectMode ? handleToggleSelect(tx.id) : setEditTx(tx)}
                  onLongPress={() => handleLongPress(tx)}
                  onReceiptPress={tx.receipt_url ? (url) => setReceiptViewUrl(url) : undefined}
                />
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      {selectMode && (
        <View style={[styles.selectBar, { paddingTop: insets.top }]}>
          <Pressable
            style={({ pressed }) => [styles.selectBarLeft, pressed && { opacity: 0.7 }]}
            onPress={exitSelectMode}
          >
            <Feather name="x" size={18} color={COLORS.text} />
            <Text style={styles.selectBarCancelText}>Cancel</Text>
          </Pressable>
          <Text style={styles.selectBarCount}>{selectedIds.size} selected</Text>
          <Pressable
            style={({ pressed }) => [styles.selectBarAllBtn, pressed && { opacity: 0.7 }]}
            onPress={handleSelectAll}
          >
            <Text style={styles.selectBarAllText}>Select All</Text>
          </Pressable>
        </View>
      )}
      {selectMode && selectedIds.size > 0 && (
        <View style={[styles.deleteBar, { bottom: insets.bottom + 62 }]}>
          <Pressable
            style={({ pressed }) => [styles.deleteBtn, pressed && { opacity: 0.8 }]}
            onPress={handleDeleteSelected}
          >
            <Feather name="trash-2" size={16} color={COLORS.background} />
            <Text style={styles.deleteBtnText}>Delete {selectedIds.size} Selected</Text>
          </Pressable>
        </View>
      )}

      <AddModal visible={showModal} type={activeTab} onClose={() => setShowModal(false)} onSave={handleSave} t={t} />
      <ReceiptReviewModal visible={showReview} imageUri={reviewUri} imageBase64={reviewBase64} onClose={() => { setShowReview(false); setReviewUri(null); setReviewBase64(undefined); }} onSave={handleSave} t={t} />
      <CsvImportModal visible={showCsv} type={activeTab} onClose={() => setShowCsv(false)} onBulkSave={handleBulkSave} t={t} />

      {/* Fullscreen receipt viewer */}
      <Modal visible={!!receiptViewUrl} transparent animationType="fade" onRequestClose={() => setReceiptViewUrl(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center', alignItems: 'center' }}>
          <Pressable
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
            onPress={() => setReceiptViewUrl(null)}
          />
          {receiptViewUrl && (
            <Image
              source={{ uri: receiptViewUrl }}
              style={{ width: '92%', height: '80%' }}
              resizeMode="contain"
            />
          )}
          <Pressable
            onPress={() => setReceiptViewUrl(null)}
            style={{ position: 'absolute', top: 54, right: 20, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 20, padding: 10 }}
          >
            <Feather name="x" size={22} color="#fff" />
          </Pressable>
        </View>
      </Modal>

      <TransactionEditModal
        tx={editTx}
        onClose={() => setEditTx(null)}
        onSave={async (updated) => { await saveTransaction(updated); await load(); setEditTx(null); }}
        currency={currency}
      />

      {dialog}
    </View>
  );
}

function SummaryCol({ label, value, color }: { label: string; value: string; color: string }) {
  const styles = makeStyles();
  return (
    <View style={styles.summaryCol}>
      <Text style={styles.summaryColLabel}>{label}</Text>
      <Text style={[styles.summaryColValue, { color }]}>{value}</Text>
    </View>
  );
}

function TransactionEditModal({ tx, onClose, onSave, currency }: {
  tx: Transaction | null;
  onClose: () => void;
  onSave: (t: Transaction) => Promise<void>;
  currency: Currency;
}) {
  const insets = useSafeAreaInsets();
  const [category, setCategory] = useState('');
  const [vatRate, setVatRate] = useState(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (tx) { setCategory(tx.category); setVatRate(tx.vatRate ?? 0); }
  }, [tx]);

  if (!tx) return null;

  const cats = tx.type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  const isIncome = tx.type === 'income';
  const amtColor = isIncome ? COLORS.success : COLORS.danger;

  const handleSave = async () => {
    setSaving(true);
    await onSave({ ...tx, category, veroCategory: getVeroCategory(category, tx.type), vatRate });
    setSaving(false);
  };

  return (
    <Modal visible={!!tx} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' }}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
      </View>
      <View style={{
        backgroundColor: '#1a1a1a',
        borderTopLeftRadius: 24, borderTopRightRadius: 24,
        borderTopWidth: 1, borderColor: COLORS.border,
        paddingBottom: insets.bottom + 20,
      }}>
        <View style={{ alignItems: 'center', paddingTop: 12, paddingBottom: 4 }}>
          <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: COLORS.border }} />
        </View>
        <View style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: COLORS.border }}>
          <Text style={{ fontSize: 15, fontWeight: '600', color: COLORS.text }} numberOfLines={1}>{tx.description}</Text>
          <Text style={{ fontSize: 20, fontWeight: '700', color: amtColor, marginTop: 2 }}>
            {isIncome ? '+' : '-'}{formatCents(tx.amountCents, currency)}
          </Text>
        </View>
        <ScrollView style={{ maxHeight: 360 }} contentContainerStyle={{ padding: 20, gap: 20 }} showsVerticalScrollIndicator={false}>
          <View>
            <Text style={{ fontSize: 10, fontWeight: '700', color: COLORS.primary, textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 10 }}>Category</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
              {cats.map(c => (
                <Pressable
                  key={c.id}
                  onPress={() => setCategory(c.id)}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 5,
                    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1,
                    backgroundColor: category === c.id ? COLORS.primaryDim : COLORS.surface,
                    borderColor: category === c.id ? COLORS.primary : COLORS.border,
                  }}
                >
                  <Feather name={c.icon as any} size={11} color={category === c.id ? COLORS.primary : COLORS.muted} />
                  <Text style={{ fontSize: 12, fontWeight: '500', color: category === c.id ? COLORS.primary : COLORS.muted }}>{c.label}</Text>
                </Pressable>
              ))}
            </View>
          </View>
          <View>
            <Text style={{ fontSize: 10, fontWeight: '700', color: COLORS.primary, textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 10 }}>VAT Rate</Text>
            {tx.vatRows && tx.vatRows.length >= 2 ? (
              <View style={{ gap: 6 }}>
                {tx.vatRows.map((row, i) => (
                  <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: COLORS.surface, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 }}>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: COLORS.text }}>{formatCents(row.grossAmountCents, currency)}</Text>
                    <Text style={{ fontSize: 12, color: COLORS.muted }}>× {row.vatRate}%</Text>
                  </View>
                ))}
              </View>
            ) : (
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {VAT_PRESETS.map(pct => (
                  <Pressable
                    key={pct}
                    onPress={() => setVatRate(pct)}
                    style={{
                      flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 12, borderWidth: 1,
                      backgroundColor: vatRate === pct ? COLORS.primary : COLORS.surface,
                      borderColor: vatRate === pct ? COLORS.primary : COLORS.border,
                    }}
                  >
                    <Text style={{ fontSize: 13, fontWeight: '700', color: vatRate === pct ? COLORS.background : COLORS.muted }}>{pct}%</Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        </ScrollView>
        <View style={{ paddingHorizontal: 20, paddingTop: 12 }}>
          <Pressable
            onPress={handleSave}
            disabled={saving}
            style={{ backgroundColor: COLORS.primary, borderRadius: 14, paddingVertical: 16, alignItems: 'center' }}
          >
            <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.background }}>{saving ? 'Saving…' : 'Save Changes'}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = () => StyleSheet.create({
  headerBlock: { paddingHorizontal: 20, gap: 4, marginBottom: 4 },
  badge: { fontSize: 9, color: COLORS.primary, letterSpacing: 4, textTransform: 'uppercase' },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  title: { fontSize: 24, fontWeight: '700', color: COLORS.text, letterSpacing: -0.5 },
  addBtn: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  divider: { height: 1, backgroundColor: COLORS.border, marginTop: 12 },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingHorizontal: 20, paddingTop: 12 },
  statCard: {
    width: '47.5%', backgroundColor: COLORS.card, borderRadius: 14,
    padding: 14, borderWidth: 1, borderColor: COLORS.border, gap: 6,
  },
  statLabel: { fontSize: 10, color: COLORS.muted, textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: '500' },
  statValue: { fontSize: 15, fontWeight: '700', letterSpacing: -0.3 },

  section: { paddingHorizontal: 20, paddingTop: 12 },
  sectionLabel: { fontSize: 10, color: COLORS.muted, textTransform: 'uppercase', letterSpacing: 1.5, fontWeight: '600', marginBottom: 8 },

  summaryCard: {
    backgroundColor: COLORS.card, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border,
    flexDirection: 'row', padding: 14,
  },
  summaryCol: { flex: 1, alignItems: 'center', gap: 4 },
  summaryColLabel: { fontSize: 10, color: COLORS.muted },
  summaryColValue: { fontSize: 13, fontWeight: '700' },
  summaryDivider: { width: 1, backgroundColor: COLORS.border, marginVertical: 2 },

  tabs: { flexDirection: 'row', borderBottomWidth: 1, borderColor: COLORS.border, marginBottom: 2 },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabLabel: { fontSize: 13, fontWeight: '600', color: COLORS.muted, textTransform: 'uppercase', letterSpacing: 0.8 },

  list: { backgroundColor: COLORS.card, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden', marginTop: 8 },
  actionRow: { flexDirection: 'row', gap: 10 },
  actionCard: { flex: 1, backgroundColor: COLORS.card, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', paddingVertical: 14, gap: 6 },
  actionLabel: { fontSize: 10, fontWeight: '600', color: COLORS.textSecondary, textTransform: 'uppercase', letterSpacing: 0.8 },

  empty: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyText: { fontSize: 15, color: COLORS.muted },
  emptyBtn: { backgroundColor: COLORS.primaryDim, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20, borderWidth: 1, borderColor: COLORS.primary + '40' },
  emptyBtnText: { fontSize: 13, fontWeight: '600', color: COLORS.primary },

  selectBar: {
    position: 'absolute' as const, left: 0, right: 0, top: 0, zIndex: 100,
    flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const,
    paddingHorizontal: 20, paddingBottom: 12,
    backgroundColor: COLORS.surface, borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  selectBarLeft: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6 },
  selectBarCancelText: { fontSize: 14, color: COLORS.text },
  selectBarCount: { fontSize: 14, fontWeight: '700' as const, color: COLORS.primary },
  selectBarAllBtn: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8,
    backgroundColor: COLORS.primaryDim, borderWidth: 1, borderColor: COLORS.primary + '40',
  },
  selectBarAllText: { fontSize: 12, fontWeight: '600' as const, color: COLORS.primary },

  deleteBar: { position: 'absolute' as const, left: 20, right: 20, zIndex: 100 },
  deleteBtn: {
    flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 8,
    backgroundColor: COLORS.danger, borderRadius: 14, paddingVertical: 15,
  },
  deleteBtnText: { fontSize: 15, fontWeight: '700' as const, color: COLORS.background },
});
