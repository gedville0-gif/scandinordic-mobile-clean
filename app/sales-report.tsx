import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { COLORS } from '@/constants/colors';
import { getTransactions, getSettings } from '@/lib/storage';
import { formatCurrency } from '@/lib/currency';
import type { Transaction, Currency } from '@/lib/types';

let Print: any = null;
let Sharing: any = null;
try { Print = require('expo-print'); } catch {}
try { Sharing = require('expo-sharing'); } catch {}

const VAT_RATES = [0, 13.5, 14, 25.5];
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export default function SalesReportScreen() {
  const styles = makeStyles();
  const insets = useSafeAreaInsets();
  const now = new Date();

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [currency, setCurrency] = useState<Currency>('EUR');
  const [settings, setSettings] = useState<any>({});
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    try {
      const [tx, s] = await Promise.all([getTransactions(), getSettings()]);
      setTransactions(tx);
      setCurrency(s.currency);
      setSettings(s);
    } catch {}
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Monthly summary — last 6 months
  const monthlySummary = useMemo(() =>
    Array.from({ length: 6 }).map((_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      const prefix = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const monthSales = transactions.filter(tx => tx.type === 'income' && tx.date.startsWith(prefix));
      return {
        label: `${MONTHS[d.getMonth()]} ${d.getFullYear()}`,
        total: monthSales.reduce((s, tx) => s + tx.amount, 0),
        count: monthSales.length,
      };
    }),
    [transactions],
  );

  const currentMonthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const currentMonthSales = useMemo(
    () => transactions.filter(tx => tx.type === 'income' && tx.date.startsWith(currentMonthPrefix)),
    [transactions, currentMonthPrefix],
  );
  const currentMonthTotal = useMemo(
    () => currentMonthSales.reduce((s, tx) => s + tx.amount, 0),
    [currentMonthSales],
  );

  // VAT breakdown for current month
  const vatBreakdown = useMemo(() =>
    VAT_RATES.map(rate => {
      const items = currentMonthSales.filter(tx => (tx.vatRate ?? 0) === rate);
      const net = items.reduce((s, tx) => s + tx.amount, 0);
      const vat = net * rate / 100;
      return { rate, net, vat, count: items.length };
    }).filter(v => v.count > 0),
    [currentMonthSales],
  );

  const totalVat = useMemo(() => vatBreakdown.reduce((s, v) => s + v.vat, 0), [vatBreakdown]);

  // Top selling items (by description, sorted by total)
  const topItems = useMemo(() => {
    const map: Record<string, { total: number; count: number }> = {};
    currentMonthSales.forEach(tx => {
      const key = tx.description || tx.category || 'Other';
      if (!map[key]) map[key] = { total: 0, count: 0 };
      map[key].total += tx.amount;
      map[key].count += 1;
    });
    return Object.entries(map)
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);
  }, [currentMonthSales]);

  const handleExportPdf = useCallback(async () => {
    if (!Print || !Sharing) {
      Alert.alert('Not available', 'expo-print and expo-sharing are required.');
      return;
    }
    setExporting(true);
    try {
      const monthLabel = `${MONTHS[now.getMonth()]} ${now.getFullYear()}`;
      const cur = currency === 'EUR' ? '€' : currency === 'SEK' ? 'kr' : currency === 'DKK' ? 'kr' : currency === 'NOK' ? 'kr' : currency;
      const fmt = (v: number) => `${cur}${v.toFixed(2)}`;

      const vatRows = VAT_RATES.map(rate => {
        const items = currentMonthSales.filter(tx => (tx.vatRate ?? 0) === rate);
        if (items.length === 0) return '';
        const net = items.reduce((s, tx) => s + tx.amount, 0);
        const vat = net * rate / 100;
        return `<tr><td>${rate}%</td><td class="r">${items.length}</td><td class="r">${fmt(net)}</td><td class="r">${fmt(vat)}</td><td class="r">${fmt(net + vat)}</td></tr>`;
      }).join('');

      const topRows = topItems.map(item =>
        `<tr><td>${item.name}</td><td class="r">${item.count}</td><td class="r bold">${fmt(item.total)}</td></tr>`
      ).join('');

      const monthlyRows = monthlySummary.map(m =>
        `<tr><td>${m.label}</td><td class="r">${m.count}</td><td class="r bold">${fmt(m.total)}</td></tr>`
      ).join('');

      const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=794">
<style>
@page { size: A4; margin: 0; }
* { box-sizing: border-box; margin: 0; padding: 0; }
html { width: 794px; height: 1123px; }
body { margin: 0; padding: 0; background: #fff; }
#page {
  font-family: Helvetica, Arial, sans-serif; color: #16161e;
  width: 794px; height: 1123px; padding: 48px; box-sizing: border-box;
  display: flex; flex-direction: column; font-size: 11px; line-height: 1.5;
  -webkit-print-color-adjust: exact;
}
.spacer { flex: 1; }
h1 { font-size: 28px; font-weight: 700; color: #16161e; letter-spacing: -0.5px; }
.subtitle { font-size: 11px; color: #6e6e78; margin-top: 4px; }
.gold-rule { height: 1px; background: #af9137; opacity: 0.65; margin: 16px 0 24px; }
.section-lbl { font-size: 8px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; color: #af9137; margin-bottom: 10px; }
table { width: 100%; table-layout: fixed; border-collapse: collapse; margin-bottom: 24px; }
th { padding: 7px 8px; text-align: left; font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.6px; background: #eaeaf0; }
th.r { text-align: right; }
td { padding: 8px 8px; border-bottom: 1px solid #f0f0f0; font-size: 11px; color: #6e6e78; }
td.r { text-align: right; }
td.bold { font-weight: 700; color: #16161e; }
.hero { background: #f6f2e8; border: 1px solid rgba(175,145,55,0.3); border-radius: 6px; padding: 16px 20px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: center; }
.hero-lbl { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; color: #af9137; }
.hero-val { font-size: 26px; font-weight: 700; color: #16161e; letter-spacing: -1px; margin-top: 4px; }
.footer { border-top: 1px solid rgba(175,145,55,0.4); padding-top: 10px; display: flex; justify-content: space-between; font-size: 8px; color: #c8c8d2; }
</style>
</head>
<body>
<div id="page">
  <h1>Sales Report</h1>
  <div class="subtitle">${monthLabel} · Generated with ScandiNordic${settings.companyName ? ' · ' + settings.companyName : ''}</div>
  <div class="gold-rule"></div>

  <div class="hero">
    <div>
      <div class="hero-lbl">Total Sales — ${monthLabel}</div>
      <div class="hero-val">${fmt(currentMonthTotal)}</div>
    </div>
    <div style="text-align:right">
      <div class="hero-lbl">Transactions</div>
      <div class="hero-val">${currentMonthSales.length}</div>
    </div>
  </div>

  <div class="section-lbl">VAT Breakdown</div>
  <table>
    <thead><tr><th>VAT Rate</th><th class="r">Items</th><th class="r">Net</th><th class="r">VAT</th><th class="r">Gross</th></tr></thead>
    <tbody>${vatRows || '<tr><td colspan="5" style="color:#999;text-align:center">No sales this month</td></tr>'}</tbody>
  </table>

  <div class="section-lbl">Top Selling Items</div>
  <table>
    <thead><tr><th>Description</th><th class="r" style="width:60px">Sales</th><th class="r" style="width:100px">Total</th></tr></thead>
    <tbody>${topRows || '<tr><td colspan="3" style="color:#999;text-align:center">No data</td></tr>'}</tbody>
  </table>

  <div class="section-lbl">Monthly Summary (Last 6 Months)</div>
  <table>
    <thead><tr><th>Month</th><th class="r" style="width:60px">Sales</th><th class="r" style="width:100px">Total</th></tr></thead>
    <tbody>${monthlyRows}</tbody>
  </table>

  <div class="spacer"></div>
  <div class="footer">
    <span>ScandiNordic Pro · Sales Report</span>
    <span>${monthLabel}</span>
  </div>
</div>
</body>
</html>`;

      const { uri } = await Print.printToFileAsync({ html, base64: false, width: 595, height: 842 });
      await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: `Sales Report ${monthLabel}` });
    } catch (e: any) {
      Alert.alert('Export failed', e?.message ?? 'Unknown error');
    } finally {
      setExporting(false);
    }
  }, [currentMonthSales, currentMonthTotal, monthlySummary, topItems, currency, settings]);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: COLORS.background }}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 40 }]}
      showsVerticalScrollIndicator={false}
    >
      <Pressable
        style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.65 }]}
        onPress={() => router.back()}
      >
        <Feather name="chevron-left" size={18} color={COLORS.primary} />
        <Text style={styles.backText}>Dashboard</Text>
      </Pressable>

      <Text style={styles.badge}>◆ ScandiNordic Pro ◆</Text>
      <Text style={styles.title}>Sales Report</Text>
      <View style={styles.divider} />

      {/* Monthly hero */}
      <View style={styles.heroCard}>
        <Text style={styles.heroLabel}>TOTAL SALES — {MONTHS[now.getMonth()].toUpperCase()} {now.getFullYear()}</Text>
        <Text style={styles.heroValue}>{formatCurrency(currentMonthTotal, currency)}</Text>
        <Text style={styles.heroSub}>{currentMonthSales.length} transaction{currentMonthSales.length !== 1 ? 's' : ''}</Text>
      </View>

      {/* VAT breakdown */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>VAT BREAKDOWN</Text>
        {vatBreakdown.length === 0 ? (
          <Text style={styles.emptyText}>No sales this month</Text>
        ) : (
          <>
            {vatBreakdown.map(v => (
              <View key={v.rate} style={styles.vatRow}>
                <View style={styles.vatLeft}>
                  <View style={styles.vatBadge}>
                    <Text style={styles.vatBadgeText}>{v.rate}%</Text>
                  </View>
                  <Text style={styles.vatNet}>Net {formatCurrency(v.net, currency)}</Text>
                </View>
                <View style={styles.vatRight}>
                  <Text style={styles.vatLabel}>VAT</Text>
                  <Text style={styles.vatAmount}>{formatCurrency(v.vat, currency)}</Text>
                </View>
              </View>
            ))}
            <View style={styles.vatTotalRow}>
              <Text style={styles.vatTotalLabel}>Total VAT collected</Text>
              <Text style={styles.vatTotalAmount}>{formatCurrency(totalVat, currency)}</Text>
            </View>
          </>
        )}
      </View>

      {/* Top selling items */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>TOP SELLING ITEMS</Text>
        {topItems.length === 0 ? (
          <Text style={styles.emptyText}>No data this month</Text>
        ) : (
          topItems.map((item, i) => (
            <View key={item.name} style={[styles.itemRow, i === 0 && { borderTopWidth: 0, paddingTop: 0 }]}>
              <View style={styles.itemRank}>
                <Text style={styles.itemRankText}>{i + 1}</Text>
              </View>
              <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
              <Text style={styles.itemCount}>{item.count}×</Text>
              <Text style={styles.itemTotal}>{formatCurrency(item.total, currency)}</Text>
            </View>
          ))
        )}
      </View>

      {/* Monthly summary */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>MONTHLY SUMMARY</Text>
        {monthlySummary.map((m, i) => {
          const isCurrentMonth = i === 5;
          return (
            <View key={m.label} style={[styles.monthRow, i === 0 && { borderTopWidth: 0, paddingTop: 0 }]}>
              <Text style={[styles.monthLabel, isCurrentMonth && { color: COLORS.text, fontWeight: '600' }]}>{m.label}</Text>
              <Text style={styles.monthCount}>{m.count} sales</Text>
              <Text style={[styles.monthTotal, isCurrentMonth && { color: COLORS.primary }]}>{formatCurrency(m.total, currency)}</Text>
            </View>
          );
        })}
      </View>

      {/* Export PDF */}
      <Pressable
        style={({ pressed }) => [styles.exportBtn, pressed && { opacity: 0.85 }]}
        onPress={handleExportPdf}
        disabled={exporting}
      >
        <Feather name="download" size={16} color={COLORS.background} />
        <Text style={styles.exportBtnText}>{exporting ? 'Exporting…' : 'Export PDF'}</Text>
      </Pressable>
    </ScrollView>
  );
}

const makeStyles = () => StyleSheet.create({
  content: { paddingHorizontal: 20, gap: 14 },

  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 8 },
  backText: { fontSize: 13, color: COLORS.primary, fontWeight: '500' },

  badge: { fontSize: 9, color: COLORS.primary, letterSpacing: 4, textTransform: 'uppercase' },
  title: { fontSize: 30, fontWeight: '700', color: COLORS.text, letterSpacing: -0.5, marginTop: 4 },
  divider: { height: 1, backgroundColor: COLORS.border, marginTop: 12 },

  heroCard: {
    backgroundColor: COLORS.card, borderRadius: 20, padding: 20,
    borderWidth: 1, borderColor: COLORS.border, gap: 4,
  },
  heroLabel: { fontSize: 9, color: COLORS.muted, textTransform: 'uppercase', letterSpacing: 2, fontWeight: '600' },
  heroValue: { fontSize: 40, fontWeight: '700', color: COLORS.primary, letterSpacing: -1.5 },
  heroSub: { fontSize: 11, color: COLORS.muted, marginTop: 2 },

  card: {
    backgroundColor: COLORS.card, borderRadius: 16,
    borderWidth: 1, borderColor: COLORS.border, padding: 16, gap: 0,
  },
  cardTitle: {
    fontSize: 9, color: COLORS.muted, textTransform: 'uppercase',
    letterSpacing: 1.5, fontWeight: '600', marginBottom: 12,
  },
  emptyText: { fontSize: 13, color: COLORS.muted, paddingBottom: 4 },

  vatRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 10, borderTopWidth: 1, borderTopColor: COLORS.border,
  },
  vatLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  vatBadge: {
    backgroundColor: COLORS.primaryDim, borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 3,
    borderWidth: 1, borderColor: COLORS.primary + '40',
  },
  vatBadgeText: { fontSize: 11, fontWeight: '700', color: COLORS.primary },
  vatNet: { fontSize: 12, color: COLORS.muted },
  vatRight: { alignItems: 'flex-end', gap: 1 },
  vatLabel: { fontSize: 9, color: COLORS.muted, textTransform: 'uppercase', letterSpacing: 0.8 },
  vatAmount: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  vatTotalRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: COLORS.primary + '40',
  },
  vatTotalLabel: { fontSize: 11, fontWeight: '600', color: COLORS.text },
  vatTotalAmount: { fontSize: 16, fontWeight: '700', color: COLORS.primary },

  itemRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingTop: 10, borderTopWidth: 1, borderTopColor: COLORS.border,
  },
  itemRank: {
    width: 22, height: 22, borderRadius: 6, backgroundColor: COLORS.surface,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  itemRankText: { fontSize: 10, fontWeight: '700', color: COLORS.muted },
  itemName: { flex: 1, fontSize: 13, fontWeight: '500', color: COLORS.text },
  itemCount: { fontSize: 11, color: COLORS.muted, width: 28, textAlign: 'right' },
  itemTotal: { fontSize: 13, fontWeight: '700', color: COLORS.text, letterSpacing: -0.3, minWidth: 80, textAlign: 'right' },

  monthRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingTop: 10, borderTopWidth: 1, borderTopColor: COLORS.border,
  },
  monthLabel: { flex: 1, fontSize: 13, color: COLORS.muted },
  monthCount: { fontSize: 11, color: COLORS.muted, width: 56, textAlign: 'right' },
  monthTotal: { fontSize: 13, fontWeight: '600', color: COLORS.text, letterSpacing: -0.3, width: 90, textAlign: 'right' },

  exportBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: COLORS.primary, borderRadius: 12, paddingVertical: 15, marginTop: 4,
  },
  exportBtnText: { fontSize: 13, fontWeight: '700', color: COLORS.background, textTransform: 'uppercase', letterSpacing: 1 },
});
