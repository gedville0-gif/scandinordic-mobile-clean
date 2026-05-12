import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, Pressable, TextInput, Modal,
  RefreshControl, KeyboardAvoidingView, Platform, Switch,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { COLORS } from '@/constants/colors';
import { InvoiceCard } from '@/components/InvoiceCard';
import { getInvoices, saveInvoice, deleteInvoice, getSettings } from '@/lib/storage';
import type { Invoice, InvoiceLineItem, Settings, Currency } from '@/lib/types';
import { useLanguage } from '@/contexts/LanguageContext';
import { formatCurrency } from '@/lib/currency';
import { useAppDialog } from '@/components/AppDialog';
import DatePickerModal from '@/components/DatePickerModal';

const VAT_PRESETS = [0, 13.5, 14, 25.5];
const PAYMENT_TERMS = ['Due on Receipt', 'Net 7', 'Net 14', 'Net 30'];

// ─── Dynamic imports (PDF) ────────────────────────────────────────────────────
let Print: any = null;
let Sharing: any = null;
let FileSystem: any = null;
try { Print = require('expo-print'); } catch {}
try { Sharing = require('expo-sharing'); } catch {}
try { FileSystem = require('expo-file-system/legacy'); } catch {}

function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2); }

// ─── Invoice PDF HTML builder ─────────────────────────────────────────────────
// Shared template: produces the same layout as the web jsPDF output.
// No browser-only APIs — pure string output, platform-agnostic.
// Mobile exports via expo-print + expo-sharing; web can use window.print().

function buildInvoiceHtml(invoice: Invoice, currency: Currency, settings: Settings): string {
  // ── Inline PDF translation table (same keys as web generatePdf.ts t()) ───────
  // Falls back to English for any missing key.
  type PdfLang = 'en' | 'fi' | 'sv' | 'da';
  const PDF_STRINGS: Record<string, Record<PdfLang, string>> = {
    invoiceTitle:   { en: 'INVOICE',            fi: 'LASKU',                sv: 'FAKTURA',                da: 'FAKTURA' },
    invoiceNo:      { en: 'Invoice No.',         fi: 'Lasku nro.',           sv: 'Fakturanr.',             da: 'Fakturanr.' },
    from:           { en: 'From',                fi: 'Lähettäjä',            sv: 'Från',                   da: 'Fra' },
    billTo:         { en: 'Bill To',             fi: 'Laskutetaan',          sv: 'Faktureras till',        da: 'Fakturér til' },
    issueDate:      { en: 'Invoice Date',        fi: 'Laskun päiväys',       sv: 'Fakturadatum',           da: 'Fakturadato' },
    dueDate:        { en: 'Due Date',            fi: 'Eräpäivä',             sv: 'Förfallodatum',          da: 'Forfaldsdato' },
    currency:       { en: 'Currency',            fi: 'Valuutta',             sv: 'Valuta',                 da: 'Valuta' },
    vatMode:        { en: 'VAT Mode',            fi: 'ALV-tila',             sv: 'Momsläge',               da: 'Momstype' },
    vatIncluded:    { en: 'VAT Incl.',           fi: 'ALV sis.',             sv: 'Inkl. moms',             da: 'Inkl. moms' },
    vatExcluded:    { en: 'VAT Excl.',           fi: 'ALV ei sis.',          sv: 'Exkl. moms',             da: 'Ekskl. moms' },
    totalAmount:    { en: 'Total Amount',        fi: 'Kokonaissumma',        sv: 'Totalt belopp',          da: 'Samlet beløb' },
    description:    { en: 'Description',         fi: 'Kuvaus',               sv: 'Beskrivning',            da: 'Beskrivelse' },
    quantity:       { en: 'Qty',                 fi: 'Määrä',                sv: 'Antal',                  da: 'Antal' },
    unit:           { en: 'Unit',                fi: 'Yksikkö',              sv: 'Enhet',                  da: 'Enhed' },
    unitPrice:      { en: 'Unit Price',          fi: 'Yksikköhinta',         sv: 'Enhetspris',             da: 'Enhedspris' },
    discount:       { en: 'Discount',            fi: 'Alennus',              sv: 'Rabatt',                 da: 'Rabat' },
    vatPct:         { en: 'VAT%',                fi: 'ALV%',                 sv: 'Moms%',                  da: 'Moms%' },
    grandTotal:     { en: 'Grand Total',         fi: 'Loppusumma',           sv: 'Totalsumma',             da: 'Slutbeløb' },
    subtotal:       { en: 'Subtotal',            fi: 'Välisumma',            sv: 'Delsumma',               da: 'Delsum' },
    afterDiscount:  { en: 'After Discount',      fi: 'Alennuksen jälkeen',   sv: 'Efter rabatt',           da: 'Efter rabat' },
    vatLabel:       { en: 'VAT',                 fi: 'ALV',                  sv: 'Moms',                   da: 'Moms' },
    paymentDetails: { en: 'Payment Details',     fi: 'Maksutiedot',          sv: 'Betalningsuppgifter',    da: 'Betalingsoplysninger' },
    accountName:    { en: 'Account Name',        fi: 'Tilinomistaja',        sv: 'Kontonamn',              da: 'Kontonavn' },
    iban:           { en: 'IBAN',                fi: 'IBAN',                 sv: 'IBAN',                   da: 'IBAN' },
    bic:            { en: 'BIC / SWIFT',         fi: 'BIC / SWIFT',          sv: 'BIC / SWIFT',            da: 'BIC / SWIFT' },
    referenceNo:    { en: 'Reference No.',       fi: 'Viitenumero',          sv: 'Referensnummer',         da: 'Referencenummer' },
    paymentRef:     { en: 'Payment Reference',   fi: 'Maksuosoite',          sv: 'Betalningsreferens',     da: 'Betalingsreference' },
    amount:         { en: 'Amount',              fi: 'Summa',                sv: 'Belopp',                 da: 'Beløb' },
    summary:        { en: 'Summary',             fi: 'Yhteenveto',           sv: 'Sammanfattning',         da: 'Oversigt' },
    notes:          { en: 'Notes',               fi: 'Lisätiedot',           sv: 'Anteckningar',           da: 'Noter' },
    companyId:      { en: 'Company ID',          fi: 'Y-tunnus',             sv: 'Org.nr.',                da: 'CVR-nr.' },
    vatNo:          { en: 'VAT No.',             fi: 'ALV-tunnus',           sv: 'Momsreg.nr.',            da: 'Momsnr.' },
    generatedWith:  { en: 'Generated with ScandiNordic', fi: 'Luotu ScandiNordicilla', sv: 'Genererad med ScandiNordic', da: 'Genereret med ScandiNordic' },
    page:           { en: 'Page 1 of 1',         fi: 'Sivu 1/1',             sv: 'Sida 1 av 1',            da: 'Side 1 af 1' },
  };
  const lang = (settings.language || 'en') as PdfLang;
  const pdfT = (key: string): string => (PDF_STRINGS[key]?.[lang] ?? PDF_STRINGS[key]?.en) || key;

  // ── Currency symbol ──────────────────────────────────────────────────────────
  const cur = currency === 'EUR' ? '€' : currency === 'SEK' ? 'kr' : currency === 'DKK' ? 'kr' : currency === 'NOK' ? 'kr' : currency;
  const fmt = (v: number) => `${cur}${v.toFixed(2)}`;

  // ── FROM fields with settings fallback (mirrors web generatePdf.ts) ──────────
  const fromName    = invoice.fromName       || settings.companyName || '';
  const fromAddress = invoice.fromAddress    || settings.address     || '';
  const fromBizId   = invoice.fromBusinessId || settings.companyId   || '';
  const fromVat     = invoice.fromVatNumber  || settings.vatNumber   || '';
  const fromEmail   = invoice.fromEmail      || settings.email       || '';
  const fromPhone   = invoice.fromPhone      || settings.phone       || '';
  const fromIban    = invoice.fromIban       || settings.iban        || '';
  const fromBic     = invoice.fromBic        || settings.bic         || '';
  const cityLine    = [settings.postalCode, settings.city].filter(Boolean).join(' ');

  const {
    clientName, clientCompanyName, clientCompanyId, clientVatId,
    clientAddress, clientCity, clientPostalCode, clientCountry,
    clientEmail, clientPhone,
    invoiceNumber, issueDate, dueDate, referenceNumber,
    lineItems = [], totalAmount, vatAmount, additionalInfo, vatIncluded,
  } = invoice;

  // ── Date formatter — locale-aware (mirrors web fmtDate) ──────────────────────
  const fmtDate = (iso: string): string => {
    if (!iso) return '—';
    const d = new Date(iso + 'T00:00:00');
    if (isNaN(d.getTime())) return iso;
    if (lang === 'en') {
      return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    }
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return `${dd}.${mm}.${d.getFullYear()}`;
  };

  // ── Discount parser (mirrors web parsePdfDiscount) ───────────────────────────
  const parsePdfDiscount = (raw: string, base: number): number => {
    if (!raw || !raw.trim()) return 0;
    const s = raw.trim();
    if (s.endsWith('%')) { const p = parseFloat(s); return isNaN(p) ? 0 : base * p / 100; }
    const n = parseFloat(s.replace(/[€$£,\s]/g, ''));
    return isNaN(n) ? 0 : n;
  };

  // ── Totals (mirrors web generatePdf.ts) ─────────────────────────────────────
  const hasDiscount = lineItems.some(li => li.discount?.trim());

  const preDiscountSubtotal = lineItems.reduce((s, li) =>
    s + (li.vatIncluded
      ? li.quantity * li.unitPrice / (1 + li.vatPercent / 100)
      : li.quantity * li.unitPrice), 0);

  const totalDiscountAmt = lineItems.reduce((s, li) =>
    s + parsePdfDiscount(li.discount, li.quantity * li.unitPrice), 0);

  const netTotal = preDiscountSubtotal - totalDiscountAmt;

  const vatGroups: Record<number, number> = {};
  lineItems.forEach(li => {
    vatGroups[li.vatPercent] = (vatGroups[li.vatPercent] || 0) + li.lineVatAmount;
  });

  // Discount column header suffix (e.g. " 10%" or " €")
  const discountedItems = lineItems.filter(li => li.discount?.trim());
  let discountSuffix = '';
  if (discountedItems.length > 0) {
    const allPct = discountedItems.every(li => (li.discount || '').trim().endsWith('%'));
    discountSuffix = allPct ? ` ${(discountedItems[0].discount || '').trim()}` : ` ${cur}`;
  }

  // Meta bar total: net when VAT excluded (mirrors web metaTotalAmt)
  const anyVatIncluded = lineItems.some(li => li.vatIncluded);
  const vatModeLabel = anyVatIncluded ? pdfT('vatIncluded') : pdfT('vatExcluded');
  const metaTotalAmt = anyVatIncluded ? totalAmount : totalAmount - (vatAmount || 0);

  // ── Barcode SVG — same bit-pattern algorithm as web generatePdf.ts ──────────
  const buildBarcodeSvg = (value: string, w: number, h: number): string => {
    const narrow = 0.8, wide = 2.0;
    const bars: number[] = [];
    for (let i = 0; i < value.length; i++) {
      const c = value.charCodeAt(i);
      for (let bit = 0; bit < 8; bit++) bars.push((c >> bit) & 1 ? wide : narrow);
      bars.push(narrow);
    }
    const totalUnits = bars.reduce((s, v) => s + v, 0);
    const unitW = w / totalUnits;
    let rects = '';
    let cx = 0;
    bars.forEach((units, i) => {
      if (i % 2 === 0) rects += `<rect x="${cx.toFixed(2)}" y="0" width="${(units * unitW).toFixed(2)}" height="${h}" fill="#16161e"/>`;
      cx += units * unitW;
    });
    return `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">${rects}</svg>`;
  };

  // ── Line items HTML ──────────────────────────────────────────────────────────
  const lineItemsHtml = lineItems.map((li, i) => {
    const net = li.lineTotal - li.lineVatAmount;
    const discAmt = parsePdfDiscount(li.discount, li.quantity * li.unitPrice);
    return `
    <tr class="${i % 2 === 1 ? 'alt' : ''}">
      <td class="desc">${li.description || ''}${li.period ? `<br><span class="period">${li.period}</span>` : ''}</td>
      <td class="r">${li.quantity}</td>
      <td class="r">${li.unit || ''}</td>
      <td class="r">${fmt(net)}</td>
      ${hasDiscount ? `<td class="r">${discAmt > 0 ? fmt(discAmt) : ''}</td>` : ''}
      <td class="r">${li.vatPercent}%</td>
      <td class="r bold">${fmt(li.lineTotal)}</td>
    </tr>`;
  }).join('');

  // ── VAT group rows ──────────────────────────────────────────────────────────
  const vatRowsHtml = Object.entries(vatGroups).map(([pct, vat]) =>
    `<div class="total-row"><span class="tlbl">${pdfT('vatLabel')} (${pct}%)</span><span class="tval">${fmt(vat as number)}</span></div>`
  ).join('');

  // ── Derived footer strings ───────────────────────────────────────────────────
  const clientCityLine    = [clientPostalCode, clientCity].filter(Boolean).join(' ');
  const footerCityCountry = [cityLine, settings.country].filter(Boolean).join(', ');
  const regLine = [
    fromBizId ? `${pdfT('companyId')}: ${fromBizId}` : '',
    fromVat   ? `${pdfT('vatNo')}: ${fromVat}`         : '',
  ].filter(Boolean).join('  ·  ');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=794">
<title>${pdfT('invoiceTitle')} ${invoiceNumber}</title>
<style>
/* Colour palette mirrors web generatePdf.ts:
   DARK #16161e · GOLD #af9137 · GREY #6e6e78 · LIGHT #faf8f4 · TAUPE #f6f2e8 · LTGRAY #eaeaf0 */
@page { size: A4; margin: 0; }
* { box-sizing: border-box; margin: 0; padding: 0; }
html { width: 794px; height: 1123px; margin: 0; padding: 0; }
body { margin: 0; padding: 0; background: #fff; }
#page { font-family: Helvetica, Arial, sans-serif; color: #16161e; width: 794px; height: 1123px; margin: 0; padding: 36px; box-sizing: border-box; display: flex; flex-direction: column; font-size: 12px; line-height: 1.5; -webkit-print-color-adjust: exact; }
.spacer { flex: 1; }

/* ── Header: three-column flex so title is truly centered, number top-right ─ */
.header { display: flex; align-items: flex-start; margin-bottom: 10px; }
.hdr-left { flex: 1; }
.hdr-center { flex: 0; white-space: nowrap; }
.inv-title { font-size: 26px; font-weight: 700; color: #16161e; letter-spacing: -0.5px; line-height: 1; }
.hdr-right { flex: 1; text-align: right; }
.inv-num-lbl { font-size: 10px; color: #6e6e78; margin-top: 6px; }
.gold-rule { height: 1px; background: #af9137; opacity: 0.65; margin: 12px 0 18px; }

/* ── FROM / BILL TO: plain two-column text (no card bg — mirrors web layout) ─ */
.parties { display: table; width: 100%; margin-bottom: 24px; }
.party { display: table-cell; width: 50%; vertical-align: top; padding-right: 16px; }
.party:last-child { padding-right: 0; padding-left: 16px; border-left: 1px solid #eaeaf0; }
.p-lbl { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.2px; color: #af9137; margin-bottom: 5px; }
.p-name { font-size: 14px; font-weight: 700; color: #16161e; margin-bottom: 2px; }
.p-meta { font-size: 10px; color: #6e6e78; margin-bottom: 1px; }
.p-reg { font-size: 10px; color: #5a5a64; margin-top: 3px; }

/* ── Meta bar: 5-column taupe card (mirrors web roundedRect) ─────────────── */
.meta-bar { display: flex; background: #f6f2e8; border-radius: 4px; margin-bottom: 24px; overflow: hidden; }
.mc { flex: 1; padding: 12px 12px; border-right: 1px solid rgba(175,145,55,0.2); }
.mc:last-child { border-right: none; }
.mc-lbl { font-size: 7px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.1px; color: #af9137; margin-bottom: 3px; white-space: nowrap; overflow: hidden; }
.mc-val { font-size: 10px; font-weight: 700; color: #16161e; }

/* ── Items table ─────────────────────────────────────────────────────────── */
table { width: 100%; table-layout: fixed; border-collapse: collapse; margin-bottom: 6px; font-size: 11px; }
thead { background: #eaeaf0; }
th { padding: 6px 4px; text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.7px; font-weight: 700; color: #16161e; white-space: nowrap; overflow: hidden; }
th.r { text-align: right; }
td { padding: 6px 4px; border-bottom: 1px solid #f0f0f0; vertical-align: top; color: #6e6e78; font-size: 11px; white-space: nowrap; overflow: hidden; }
td.desc { color: #16161e; }
td.bold { font-weight: 700; color: #16161e; }
td.r { text-align: right; }
tr.alt td { background: #faf8f4; }
.period { font-size: 8px; color: #999; }
.table-rule { width: 100%; height: 1px; background: #af9137; margin-bottom: 14px; opacity: 0.5; }

/* ── Payment + Totals two-column section ─────────────────────────────────── */
.bottom { display: table; width: 100%; margin-top: 40px; }
.payment { display: table-cell; width: 50%; vertical-align: top; padding-right: 8px; }
.sec-lbl { font-size: 8px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.2px; color: #af9137; margin-bottom: 7px; }
.pay-row { display: flex; gap: 8px; margin-bottom: 4px; }
.pay-key { font-size: 11px; color: #6e6e78; width: 84px; flex-shrink: 0; }
.pay-val { font-size: 11px; font-weight: 600; color: #16161e; font-family: monospace; }

/* Barcode block — only shows when IBAN + reference both present */
.bc-wrap { margin-top: 14px; padding-top: 12px; border-top: 1px solid #eaeaf0; display: flex; flex-direction: column; align-items: center; }
.bc-title { font-size: 8px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.2px; color: #af9137; text-align: center; margin-bottom: 5px; width: 100%; }
.bc-ref { font-size: 9px; color: #6e6e78; text-align: center; margin-top: 4px; font-family: monospace; letter-spacing: 1px; }
.bc-details { margin-top: 10px; width: 100%; }
.bc-row { display: flex; justify-content: space-between; margin-bottom: 3px; }
.bc-k { font-size: 10px; font-weight: 700; color: #16161e; }
.bc-v { font-size: 10px; color: #6e6e78; font-family: monospace; text-align: right; }

/* ── Summary / totals (right column) ────────────────────────────────────── */
.totals { display: table-cell; width: 50%; vertical-align: top; padding-left: 8px; }
.total-row { display: flex; justify-content: space-between; padding: 3.5px 0; border-bottom: 1px solid #eee; font-size: 11px; }
.tlbl { color: #6e6e78; }
.tval { font-weight: 600; color: #16161e; }
.total-rule { height: 1px; background: #af9137; margin: 7px 0; opacity: 0.6; }
/* Grand total: TAUPE bg + gold border — mirrors web roundedRect FD style */
.grand-total { background: #f6f2e8; border: 1px solid #af9137; padding: 12px 14px; border-radius: 4px; display: flex; justify-content: space-between; font-weight: 700; font-size: 13px; color: #16161e; margin-top: 4px; }

/* ── Footer ──────────────────────────────────────────────────────────────── */
.footer { margin-top: 36px; border-top: 1px solid rgba(175,145,55,0.45); padding-top: 10px; display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; }
.fl { font-size: 11px; color: #6e6e78; line-height: 1.7; }
.fl-name { font-weight: 700; color: #16161e; font-size: 11px; display: block; }
.fr { flex: 1; }
.notes-lbl { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.2px; color: #af9137; margin-bottom: 4px; }
.notes-body { font-size: 11px; color: #6e6e78; line-height: 1.5; }
/* Watermark — very bottom */
.watermark { margin-top: 14px; display: flex; justify-content: space-between; }
.wm { font-size: 8px; color: #c8c8d2; }
</style>
</head>
<body>
<div id="page">

<!-- HEADER: three-column flex — truly centered title, invoice number right -->
<div class="header">
  <div class="hdr-left"></div>
  <div class="hdr-center"><div class="inv-title">${pdfT('invoiceTitle')}</div></div>
  <div class="hdr-right"><div class="inv-num-lbl">${pdfT('invoiceNo')} ${invoiceNumber}</div></div>
</div>
<div class="gold-rule"></div>

<!-- FROM / BILL TO: plain two-column text (mirrors web col1X/col2X layout) -->
<div class="parties">
  <div class="party">
    <div class="p-lbl">${pdfT('from')}</div>
    ${fromName    ? `<div class="p-name">${fromName}</div>`    : ''}
    ${fromAddress ? `<div class="p-meta">${fromAddress}</div>` : ''}
    ${cityLine    ? `<div class="p-meta">${cityLine}</div>`    : ''}
    ${settings.country ? `<div class="p-meta">${settings.country}</div>` : ''}
    ${fromEmail   ? `<div class="p-meta">${fromEmail}</div>`   : ''}
    ${fromPhone   ? `<div class="p-meta">${fromPhone}</div>`   : ''}
    ${(fromBizId || fromVat) ? `<div class="p-reg">${[fromBizId ? `${pdfT('companyId')}: ${fromBizId}` : '', fromVat ? `${pdfT('vatNo')}: ${fromVat}` : ''].filter(Boolean).join('  ·  ')}</div>` : ''}
    ${(fromIban || fromBic) ? `<div class="p-reg">${[fromIban ? `IBAN: ${fromIban}` : '', fromBic ? `BIC: ${fromBic}` : ''].filter(Boolean).join('  ')}</div>` : ''}
  </div>
  <div class="party">
    <div class="p-lbl">${pdfT('billTo')}</div>
    <div class="p-name">${clientName}</div>
    ${clientCompanyName ? `<div class="p-meta">${clientCompanyName}</div>` : ''}
    ${clientAddress     ? `<div class="p-meta">${clientAddress}</div>`     : ''}
    ${clientCityLine    ? `<div class="p-meta">${clientCityLine}</div>`    : ''}
    ${clientCountry     ? `<div class="p-meta">${clientCountry}</div>`     : ''}
    ${clientEmail       ? `<div class="p-meta">${clientEmail}</div>`       : ''}
    ${clientPhone       ? `<div class="p-meta">${clientPhone}</div>`       : ''}
    ${(clientCompanyId || clientVatId) ? `<div class="p-reg">${[clientCompanyId ? `${pdfT('companyId')}: ${clientCompanyId}` : '', clientVatId ? `${pdfT('vatNo')}: ${clientVatId}` : ''].filter(Boolean).join('  ·  ')}</div>` : ''}
  </div>
</div>

<!-- META BAR: 5 columns — mirrors web metaItems array -->
<div class="meta-bar">
  <div class="mc"><div class="mc-lbl">${pdfT('issueDate')}</div><div class="mc-val">${fmtDate(issueDate)}</div></div>
  <div class="mc"><div class="mc-lbl">${pdfT('dueDate')}</div><div class="mc-val">${dueDate ? fmtDate(dueDate) : '—'}</div></div>
  <div class="mc"><div class="mc-lbl">${pdfT('currency')}</div><div class="mc-val">${currency} (${cur})</div></div>
  <div class="mc"><div class="mc-lbl">${pdfT('vatMode')}</div><div class="mc-val">${vatModeLabel}</div></div>
  <div class="mc"><div class="mc-lbl">${pdfT('totalAmount')}</div><div class="mc-val">${fmt(metaTotalAmt)}</div></div>
</div>

<!-- ITEMS TABLE -->
${lineItems.length > 0 ? `
<table style="width:100%; table-layout:fixed;">
  <thead>
    <tr>
      <th style="width:28%">${pdfT('description').toUpperCase()}</th>
      <th class="r" style="width:6%">${pdfT('quantity').toUpperCase()}</th>
      <th class="r" style="width:7%">${pdfT('unit').toUpperCase()}</th>
      <th class="r" style="width:13%">${pdfT('unitPrice').toUpperCase()}</th>
      ${hasDiscount ? `<th class="r" style="width:13%">${pdfT('discount').toUpperCase()}${discountSuffix}</th>` : ''}
      <th class="r" style="width:8%">${pdfT('vatPct').toUpperCase()}</th>
      <th class="r" style="width:13%">${pdfT('grandTotal').toUpperCase()}</th>
    </tr>
  </thead>
  <tbody>${lineItemsHtml}</tbody>
</table>
<div class="table-rule"></div>` : ''}

<!-- PAYMENT DETAILS + SUMMARY: two-column (mirrors web payX/totX layout) -->
<div class="bottom">
  <div class="payment">
    ${(fromIban && referenceNumber) ? `
    <div class="bc-wrap">
      <div class="bc-title">${pdfT('paymentDetails')}</div>
      ${buildBarcodeSvg(referenceNumber, 200, 45)}
      <div class="bc-ref">${referenceNumber}</div>
      <div class="bc-details">
        ${fromName       ? `<div class="bc-row"><span class="bc-k">${pdfT('accountName')}:</span><span class="bc-v">${fromName}</span></div>` : ''}
        <div class="bc-row"><span class="bc-k">${pdfT('iban')}:</span><span class="bc-v">${fromIban}</span></div>
        ${fromBic        ? `<div class="bc-row"><span class="bc-k">${pdfT('bic')}:</span><span class="bc-v">${fromBic}</span></div>` : ''}
        <div class="bc-row"><span class="bc-k">${pdfT('referenceNo')}:</span><span class="bc-v">${referenceNumber}</span></div>
        <div class="bc-row"><span class="bc-k">${pdfT('amount')}:</span><span class="bc-v">${fmt(totalAmount)}</span></div>
        ${dueDate ? `<div class="bc-row"><span class="bc-k">${pdfT('dueDate')}:</span><span class="bc-v">${fmtDate(dueDate)}</span></div>` : ''}
      </div>
    </div>` : ''}
  </div>

  <!-- SUMMARY: subtotal → [discount → after discount] → VAT groups → rule → total -->
  <div class="totals">
    <div class="sec-lbl">${pdfT('summary')}</div>
    <div class="total-row"><span class="tlbl">${pdfT('subtotal')}</span><span class="tval">${fmt(preDiscountSubtotal)}</span></div>
    ${totalDiscountAmt > 0 ? `
    <div class="total-row"><span class="tlbl">${pdfT('discount')}${discountSuffix}</span><span class="tval">− ${fmt(totalDiscountAmt)}</span></div>
    <div class="total-row"><span class="tlbl">${pdfT('afterDiscount')}</span><span class="tval">${fmt(netTotal)}</span></div>` : ''}
    ${vatRowsHtml}
    <div class="total-rule"></div>
    <div class="grand-total"><span>${pdfT('totalAmount')}</span><span>${fmt(totalAmount)}</span></div>
  </div>
</div>

<div class="spacer"></div>

<!-- FOOTER: company info left + notes right — mirrors web footer layout -->
<div class="footer">
  <div class="fl">
    ${fromName ? `<span class="fl-name">${fromName}</span>` : ''}
    ${fromAddress ? `<div>${fromAddress}</div>` : ''}
    ${footerCityCountry ? `<div>${footerCityCountry}</div>` : ''}
    ${(fromEmail || fromPhone) ? `<div>${[fromEmail, fromPhone].filter(Boolean).join('  ·  ')}</div>` : ''}
    ${regLine ? `<div>${regLine}</div>` : ''}
  </div>
  ${additionalInfo ? `
  <div class="fr">
    <div class="notes-lbl">${pdfT('notes')}</div>
    <div class="notes-body">${additionalInfo}</div>
  </div>` : ''}
</div>

<!-- WATERMARK: mirrors web generatedWith + pageOf -->
<div class="watermark">
  <span class="wm">${pdfT('generatedWith')}</span>
  <span class="wm">${pdfT('page')}</span>
</div>

</div>
</body>
</html>`;
}

function getNextInvoiceNumber(invoices: Invoice[]): string {
  const nums = invoices.map(inv => {
    const m = inv.invoiceNumber?.match(/(\d+)$/);
    return m ? parseInt(m[1], 10) : 0;
  });
  const max = nums.length > 0 ? Math.max(...nums) : 0;
  return `INV-${String(max + 1).padStart(3, '0')}`;
}

function parseDiscount(discount: string, gross: number): number {
  if (!discount) return 0;
  const s = discount.trim();
  if (s.endsWith('%')) {
    const pct = parseFloat(s.slice(0, -1));
    return isNaN(pct) ? 0 : gross * pct / 100;
  }
  const val = parseFloat(s.replace(',', '.'));
  return isNaN(val) ? 0 : val;
}

function recalcLineItem(li: InvoiceLineItem): InvoiceLineItem {
  const gross = li.quantity * li.unitPrice;
  const discAmt = parseDiscount(li.discount, gross);
  const afterDiscount = Math.max(0, gross - discAmt);
  let lineNet: number, lineVatAmount: number, lineTotal: number;
  if (li.vatIncluded) {
    lineTotal = afterDiscount;
    lineNet = lineTotal / (1 + li.vatPercent / 100);
    lineVatAmount = lineTotal - lineNet;
  } else {
    lineNet = afterDiscount;
    lineVatAmount = lineNet * (li.vatPercent / 100);
    lineTotal = lineNet + lineVatAmount;
  }
  return { ...li, lineTotal, lineVatAmount };
}

function defaultLineItem(): InvoiceLineItem {
  return { id: genId(), description: '', period: '', quantity: 1, unit: 'pcs', unitPrice: 0, vatPercent: 25.5, vatIncluded: false, discount: '', lineTotal: 0, lineVatAmount: 0 };
}

function calcDueDateStr(issueDateStr: string, term: string): string {
  const d = new Date(issueDateStr + 'T12:00:00');
  if (isNaN(d.getTime())) return issueDateStr;
  if (term === 'Net 7') d.setDate(d.getDate() + 7);
  else if (term === 'Net 14') d.setDate(d.getDate() + 14);
  else if (term === 'Net 30') d.setDate(d.getDate() + 30);
  // 'Due on Receipt' = same day, no offset
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${day}`;
}

// ─── Main Screen ────────────────────────────────────────────────────────────

export default function InvoicesScreen() {
  const styles = makeStyles();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const { show: showDialog, dialog } = useAppDialog();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [currency, setCurrency] = useState<Currency>('EUR');
  const [settings, setSettings] = useState<Settings>({ language: 'en', currency: 'EUR', darkMode: true });
  const [showModal, setShowModal] = useState(false);
  const [editInvoice, setEditInvoice] = useState<Invoice | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState<Invoice['status'] | 'all'>('all');

  const load = useCallback(async () => {
    const [inv, s] = await Promise.all([getInvoices(), getSettings()]);
    setInvoices(inv);
    setSettings(s);
    setCurrency(s.currency);
  }, []);

  useEffect(() => { load(); }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const handleDelete = async (id: string) => {
    const idx = await showDialog(t('delete'), t('removeThisInvoice'), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('delete'), style: 'destructive' },
    ]);
    if (idx === 1) { await deleteInvoice(id); await load(); }
  };

  const handleDownload = async (invoice: Invoice) => {
    if (!Print || !Sharing) { showDialog(t('notInstalled'), 'Run in your project:\nnpx expo install expo-print expo-sharing'); return; }
    try {
      const html = buildInvoiceHtml(invoice, currency, settings);
      const { uri } = await Print.printToFileAsync({ html, base64: false, width: 595, height: 842 });
      await Sharing.shareAsync(uri, {
        mimeType: 'application/pdf',
        UTI: 'com.adobe.pdf',
        dialogTitle: `Invoice_${invoice.invoiceNumber}.pdf`,
      });
    } catch (e: any) {
      showDialog('Download Error', e?.message ?? 'Could not open PDF.');
    }
  };

  const handlePdf = async (invoice: Invoice) => {
    if (!Print || !Sharing) {
      showDialog(t('notInstalled'), 'Run in your project:\nnpx expo install expo-print expo-sharing');
      return;
    }
    try {
      const html = buildInvoiceHtml(invoice, currency, settings);
      const { uri } = await Print.printToFileAsync({ html, base64: false, width: 595, height: 842 });
      await Sharing.shareAsync(uri, {
        mimeType: 'application/pdf',
        dialogTitle: `Invoice ${invoice.invoiceNumber}`,
        UTI: 'com.adobe.pdf',
      });
    } catch (e: any) {
      showDialog('PDF Error', e?.message ?? 'Could not generate PDF.');
    }
  };

  const filters: (Invoice['status'] | 'all')[] = ['all', 'draft', 'sent', 'paid', 'overdue'];
  const FILTER_COLORS: Record<string, string> = {
    all: COLORS.primary, draft: COLORS.muted, sent: COLORS.info, paid: COLORS.success, overdue: COLORS.danger,
  };
  const FILTER_ICONS: Record<string, string> = {
    all: 'list', draft: 'file', sent: 'send', paid: 'check-circle', overdue: 'clock',
  };

  const filtered = activeFilter === 'all' ? invoices : invoices.filter(i => i.status === activeFilter);
  const totalPaid = invoices.filter(i => i.status === 'paid').reduce((s, i) => s + i.totalAmount, 0);
  const totalPending = invoices.filter(i => i.status === 'sent').reduce((s, i) => s + i.totalAmount, 0);
  const unpaidCount = invoices.filter(i => i.status === 'sent' || i.status === 'overdue').length;
  const unpaidTotal = invoices.filter(i => i.status === 'sent' || i.status === 'overdue').reduce((s, i) => s + i.totalAmount, 0);

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <Text style={styles.screenTitle}>{t('invoices')}</Text>
        <Pressable
          style={styles.addBtn}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowModal(true); }}
        >
          <Feather name="plus" size={16} color={COLORS.primary} />
        </Pressable>
      </View>

      {/* Summary row */}
      <View style={styles.summaryRow}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>{t('paid')}</Text>
          <Text style={[styles.summaryValue, { color: COLORS.success }]}>{formatCurrency(totalPaid, currency)}</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>{t('sent')}</Text>
          <Text style={[styles.summaryValue, { color: COLORS.info }]}>{formatCurrency(totalPending, currency)}</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>{t('total')}</Text>
          <Text style={[styles.summaryValue, { color: COLORS.text }]}>{invoices.length}</Text>
        </View>
      </View>

      {/* Unpaid banner */}
      {unpaidCount > 0 && activeFilter === 'all' && (
        <View style={styles.unpaidBanner}>
          <View>
            <Text style={styles.unpaidCount}>{unpaidCount} {t('unpaid')}</Text>
            <Text style={styles.unpaidAmt}>{formatCurrency(unpaidTotal, currency)} {t('outstanding')}</Text>
          </View>
          <Pressable onPress={() => setActiveFilter('sent')}>
            <Text style={styles.unpaidLink}>{t('all')} →</Text>
          </Pressable>
        </View>
      )}

      {/* Filter pills */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={styles.filterRow}>
        {filters.map(f => {
          const col = FILTER_COLORS[f];
          const icon = FILTER_ICONS[f] || 'circle';
          const active = activeFilter === f;
          return (
            <Pressable
              key={f}
              style={[styles.filterPill, active && { backgroundColor: col + '20', borderColor: col }]}
              onPress={() => { setActiveFilter(f); Haptics.selectionAsync(); }}
            >
              <Feather name={icon as any} size={11} color={active ? col : COLORS.muted} />
              <Text style={[styles.filterText, active && { color: col }]}>
                {t(f === 'all' ? 'all' : f)}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 100, paddingTop: 4 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
      >
        {filtered.length === 0 ? (
          <View style={styles.empty}>
            <Feather name="file-text" size={36} color={COLORS.muted} />
            <Text style={styles.emptyText}>{t('noInvoices')}</Text>
            <Pressable style={styles.emptyBtn} onPress={() => setShowModal(true)}>
              <Text style={styles.emptyBtnText}>{t('createInvoice')}</Text>
            </Pressable>
          </View>
        ) : (
          filtered.map(inv => (
            <InvoiceCard
              key={inv.id}
              invoice={inv}
              currency={currency}
              onPress={() => {
                if (inv.status === 'draft') { setEditInvoice(inv); setShowModal(true); }
                else handleDelete(inv.id);
              }}
              onPdfPress={() => handlePdf(inv)}
              onDownloadPress={() => handleDownload(inv)}
            />
          ))
        )}
      </ScrollView>

      <AddInvoiceModal
        visible={showModal}
        onClose={() => { setShowModal(false); setEditInvoice(null); }}
        onSave={async (inv) => { await saveInvoice(inv); await load(); }}
        t={t}
        currency={currency}
        settings={settings}
        invoices={invoices}
        initialInvoice={editInvoice}
      />
      {dialog}
    </View>
  );
}

// ─── Add Invoice Modal ───────────────────────────────────────────────────────

interface AddInvoiceModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (inv: Invoice) => void;
  t: (k: string) => string;
  currency: Currency;
  settings: Settings;
  invoices: Invoice[];
  initialInvoice?: Invoice | null;
}

function AddInvoiceModal({ visible, onClose, onSave, t, currency, settings, invoices, initialInvoice }: AddInvoiceModalProps) {
  const m = makeM();
  const insets = useSafeAreaInsets();
  const { show: showDialog, dialog } = useAppDialog();
  const computedNextNum = useMemo(() => getNextInvoiceNumber(invoices), [invoices, visible]);
  const nextInvNum = initialInvoice?.invoiceNumber ?? computedNextNum;

  // FROM
  const [fromEditOpen, setFromEditOpen] = useState(false);
  const [fromName, setFromName] = useState('');
  const [fromAddress, setFromAddress] = useState('');
  const [fromBusinessId, setFromBusinessId] = useState('');
  const [fromVatNumber, setFromVatNumber] = useState('');
  const [fromEmail, setFromEmail] = useState('');
  const [fromPhone, setFromPhone] = useState('');
  const [fromIban, setFromIban] = useState('');
  const [fromBic, setFromBic] = useState('');

  // BILL TO
  const [clientName, setClientName] = useState('');
  const [clientCompanyName, setClientCompanyName] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [clientAddress, setClientAddress] = useState('');
  const [clientPostalCode, setClientPostalCode] = useState('');
  const [clientCity, setClientCity] = useState('');
  const [clientCountry, setClientCountry] = useState('');
  const [clientCompanyId, setClientCompanyId] = useState('');
  const [clientVatId, setClientVatId] = useState('');
  const [clientPhone, setClientPhone] = useState('');

  // Invoice details
  const [issueDate, setIssueDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [paymentTerms, setPaymentTerms] = useState('Net 30');
  const [showIssueDatePicker, setShowIssueDatePicker] = useState(false);
  const [showDueDatePicker, setShowDueDatePicker] = useState(false);
  const [status, setStatus] = useState<Invoice['status']>('draft');

  // Line items
  const [lineItems, setLineItems] = useState<InvoiceLineItem[]>([defaultLineItem()]);
  const [rawUnitPrices, setRawUnitPrices] = useState<Record<string, string>>({});

  // Notes
  const [additionalInfo, setAdditionalInfo] = useState('');

  // Pre-fill from initialInvoice (edit) or settings (new) when modal opens
  useEffect(() => {
    if (!visible) return;
    const now = new Date();
    const due = new Date(now);
    due.setDate(due.getDate() + 30);
    if (initialInvoice) {
      const iv = initialInvoice;
      setFromName(iv.fromName || ''); setFromAddress(iv.fromAddress || '');
      setFromBusinessId(iv.fromBusinessId || ''); setFromVatNumber(iv.fromVatNumber || '');
      setFromEmail(iv.fromEmail || ''); setFromPhone(iv.fromPhone || '');
      setFromIban(iv.fromIban || ''); setFromBic(iv.fromBic || '');
      setClientName(iv.clientName || ''); setClientCompanyName(iv.clientCompanyName || '');
      setClientEmail(iv.clientEmail || ''); setClientAddress(iv.clientAddress || '');
      setClientPostalCode(iv.clientPostalCode || ''); setClientCity(iv.clientCity || '');
      setClientCountry(iv.clientCountry || ''); setClientCompanyId(iv.clientCompanyId || '');
      setClientVatId(iv.clientVatId || ''); setClientPhone(iv.clientPhone || '');
      setIssueDate(iv.issueDate?.split('T')[0] || now.toISOString().split('T')[0]);
      setDueDate(iv.dueDate?.split('T')[0] || due.toISOString().split('T')[0]);
      setReferenceNumber(iv.referenceNumber || '');
      setPaymentTerms(iv.paymentTerms || 'Net 30');
      setStatus(iv.status);
      setLineItems(iv.lineItems?.length ? iv.lineItems : [defaultLineItem()]);
      setAdditionalInfo(iv.additionalInfo || '');
    } else {
      setIssueDate(now.toISOString().split('T')[0]);
      setDueDate(due.toISOString().split('T')[0]);
      setFromName(settings.companyName || ''); setFromAddress(settings.address || '');
      setFromBusinessId(settings.companyId || ''); setFromVatNumber(settings.vatNumber || '');
      setFromEmail(settings.email || ''); setFromPhone(settings.phone || '');
      setFromIban(settings.iban || ''); setFromBic(settings.bic || '');
    }
  }, [visible]);

  const reset = () => {
    setFromEditOpen(false);
    setClientName(''); setClientCompanyName(''); setClientEmail('');
    setClientAddress(''); setClientPostalCode(''); setClientCity('');
    setClientCountry(''); setClientCompanyId(''); setClientVatId(''); setClientPhone('');
    setReferenceNumber(''); setPaymentTerms('Net 30'); setStatus('draft');
    setLineItems([defaultLineItem()]); setAdditionalInfo('');
  };

  const handleClose = () => { reset(); onClose(); };

  // Line item helpers
  const updateLineItem = (id: string, field: string, value: string) => {
    setLineItems(prev => prev.map(li => {
      if (li.id !== id) return li;
      let updated: InvoiceLineItem;
      if (field === 'description' || field === 'period' || field === 'unit' || field === 'discount') {
        updated = { ...li, [field]: value };
      } else {
        const num = parseFloat(value.replace(',', '.'));
        updated = { ...li, [field]: isNaN(num) ? 0 : num };
      }
      return recalcLineItem(updated);
    }));
  };

  const toggleLineItemVat = (id: string, value: boolean) => {
    setLineItems(prev => prev.map(li =>
      li.id === id ? recalcLineItem({ ...li, vatIncluded: value }) : li
    ));
  };

  const addLineItem = () => {
    const last = lineItems[lineItems.length - 1];
    const vat = last ? last.vatPercent : 25.5;
    setLineItems(prev => [...prev, { ...defaultLineItem(), vatPercent: vat }]);
  };

  const removeLineItem = (id: string) => {
    if (lineItems.length <= 1) return;
    setLineItems(prev => prev.filter(li => li.id !== id));
  };

  const applyVatPreset = (pct: number) => {
    setLineItems(prev => prev.map(li => recalcLineItem({ ...li, vatPercent: pct })));
  };

  // Totals
  const netSubtotal = lineItems.reduce((s, li) => s + (li.lineTotal - li.lineVatAmount), 0);
  const vatTotal = lineItems.reduce((s, li) => s + li.lineVatAmount, 0);
  const grandTotal = netSubtotal + vatTotal;
  const vatGroups = Object.entries(
    lineItems.reduce((acc, li) => {
      if (li.lineVatAmount > 0) acc[li.vatPercent] = (acc[li.vatPercent] || 0) + li.lineVatAmount;
      return acc;
    }, {} as Record<number, number>)
  ).map(([pct, vat]) => ({ pct: Number(pct), vat }));

  const handleSave = () => {
    if (!clientName.trim()) { showDialog(t('clientName') + ' required'); return; }
    if (lineItems.every(li => !li.description.trim() && li.unitPrice === 0)) {
      showDialog('Add at least one line item'); return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const inv: Invoice = {
      id: initialInvoice?.id ?? genId(),
      invoiceNumber: nextInvNum,
      fromName, fromAddress, fromBusinessId, fromVatNumber, fromEmail, fromPhone, fromIban, fromBic,
      clientName: clientName.trim(),
      clientCompanyName, clientCompanyId, clientVatId,
      clientAddress, clientCity, clientPostalCode, clientCountry,
      clientEmail, clientPhone,
      issueDate, dueDate, referenceNumber, paymentTerms,
      vatIncluded: lineItems.some(li => li.vatIncluded ?? false),
      lineItems,
      amount: netSubtotal,
      vatAmount: vatTotal,
      totalAmount: grandTotal,
      status,
      currency,
      additionalInfo,
    };
    onSave(inv);
    reset();
    onClose();
  };

  const STATUS_COLORS = { draft: COLORS.muted, sent: COLORS.info, paid: COLORS.success, overdue: COLORS.danger };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: COLORS.background }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>

        {/* Header */}
        <View style={[m.header, { paddingTop: insets.top + 16 }]}>
          <Pressable onPress={handleClose}><Text style={m.cancel}>{t('cancel')}</Text></Pressable>
          <View style={{ alignItems: 'center' }}>
            <Text style={m.title}>{initialInvoice ? t('edit') + ' Invoice' : t('createInvoice')}</Text>
            <Text style={m.invNum}>#{nextInvNum}</Text>
          </View>
          <Pressable onPress={handleSave}><Text style={m.saveBtn}>{t('save')}</Text></Pressable>
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={m.body} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

          {/* ── 1. FROM ── */}
          <SectionLabel label={t('from')} />
          {!fromEditOpen ? (
            <View style={m.card}>
              <View style={m.cardRow}>
                <View style={{ flex: 1 }}>
                  {fromName ? (
                    <>
                      <Text style={m.fromName}>{fromName}</Text>
                      {fromAddress ? <Text style={m.fromMeta}>{fromAddress}</Text> : null}
                      {(fromBusinessId || fromVatNumber) ? (
                        <Text style={m.fromMeta}>{[fromBusinessId && `ID: ${fromBusinessId}`, fromVatNumber && `VAT: ${fromVatNumber}`].filter(Boolean).join('  ')}</Text>
                      ) : null}
                      {(fromIban || fromBic) ? (
                        <Text style={m.fromMeta}>{[fromIban && `IBAN: ${fromIban}`, fromBic && `BIC: ${fromBic}`].filter(Boolean).join('  ')}</Text>
                      ) : null}
                    </>
                  ) : (
                    <Text style={m.fromMeta}>No company info — add in Settings</Text>
                  )}
                </View>
                <Pressable style={m.editChip} onPress={() => setFromEditOpen(true)}>
                  <Text style={m.editChipText}>{t('edit')}</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <View style={m.card}>
              <View style={m.cardTitleRow}>
                <Text style={m.cardTitle}>{t('from')}</Text>
                <Pressable onPress={() => setFromEditOpen(false)}><Text style={m.cardClose}>✕ Done</Text></Pressable>
              </View>
              {([
                [t('companyName'), fromName, setFromName],
                [t('streetAddress'), fromAddress, setFromAddress],
                [t('companyId'), fromBusinessId, setFromBusinessId],
                [t('vatNo'), fromVatNumber, setFromVatNumber],
                [t('email'), fromEmail, setFromEmail],
                [t('phoneLabel'), fromPhone, setFromPhone],
                ['IBAN', fromIban, setFromIban],
                ['BIC / SWIFT', fromBic, setFromBic],
              ] as [string, string, (v: string) => void][]).map(([lbl, val, setter]) => (
                <View key={lbl} style={{ marginBottom: 10 }}>
                  <Text style={m.fieldLabel}>{lbl}</Text>
                  <TextInput style={m.input} value={val} onChangeText={setter} placeholderTextColor={COLORS.muted} />
                </View>
              ))}
            </View>
          )}

          {/* ── 2. BILL TO ── */}
          <SectionLabel label={t('billTo')} />
          <View style={m.card}>
            <Field label={t('clientName') + ' *'} value={clientName} onChangeText={setClientName} />
            <Field label={t('clientCompanyName')} value={clientCompanyName} onChangeText={setClientCompanyName} />
            <Field label={t('email')} value={clientEmail} onChangeText={setClientEmail} keyboardType="email-address" />
            <Field label={t('clientAddress')} value={clientAddress} onChangeText={setClientAddress} />
            <View style={m.twoCol}>
              <View style={{ width: 90 }}>
                <Field label={t('clientPostalCode')} value={clientPostalCode} onChangeText={setClientPostalCode} keyboardType="numeric" />
              </View>
              <View style={{ flex: 1 }}>
                <Field label={t('clientCity')} value={clientCity} onChangeText={setClientCity} />
              </View>
            </View>
            <Field label={t('clientCountry')} value={clientCountry} onChangeText={setClientCountry} />
            <View style={m.twoCol}>
              <View style={{ flex: 1 }}>
                <Field label={t('clientCompanyId')} value={clientCompanyId} onChangeText={setClientCompanyId} />
              </View>
              <View style={{ flex: 1 }}>
                <Field label={t('clientVatId')} value={clientVatId} onChangeText={setClientVatId} />
              </View>
            </View>
            <Field label={t('phoneLabel')} value={clientPhone} onChangeText={setClientPhone} keyboardType="phone-pad" />
          </View>

          {/* ── 3. INVOICE DETAILS ── */}
          <SectionLabel label={t('invoiceDetails')} />
          <View style={m.card}>
            <View style={m.detailsGrid}>
              <View style={m.detailsCell}>
                <Text style={m.fieldLabel}>{t('invoiceNo')}</Text>
                <Text style={m.invNumDisplay}>#{nextInvNum}</Text>
              </View>
              <View style={[m.detailsCell, m.detailsCellBorder]}>
                <Text style={m.fieldLabel}>{t('issueDate')}</Text>
                <Pressable onPress={() => setShowIssueDatePicker(true)}>
                  <Text style={m.detailInput}>{issueDate}</Text>
                </Pressable>
              </View>
            </View>
            <View style={m.detailsDivider} />
            <View style={m.detailsGrid}>
              <View style={m.detailsCell}>
                <Text style={m.fieldLabel}>{t('dueDate')}</Text>
                <Pressable onPress={() => setShowDueDatePicker(true)}>
                  <Text style={m.detailInput}>{dueDate}</Text>
                </Pressable>
              </View>
              <View style={[m.detailsCell, m.detailsCellBorder]}>
                <Text style={m.fieldLabel}>{t('referenceNumber')}</Text>
                <TextInput style={m.detailInput} value={referenceNumber} onChangeText={setReferenceNumber} placeholder="e.g. PO-1234" placeholderTextColor={COLORS.muted} />
              </View>
            </View>
            <View style={m.detailsDivider} />
            <View style={{ paddingHorizontal: 12, paddingVertical: 10 }}>
              <Text style={m.fieldLabel}>{t('paymentTerms')}</Text>
              <View style={m.chipRow}>
                {PAYMENT_TERMS.map(term => (
                  <Pressable key={term} style={[m.chip, paymentTerms === term && m.chipActive]} onPress={() => {
                    setPaymentTerms(term);
                    setDueDate(calcDueDateStr(issueDate, term));
                  }}>
                    <Text style={[m.chipText, paymentTerms === term && m.chipTextActive]}>{term}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </View>

          {/* ── 4. LINE ITEMS ── */}
          <SectionLabel label={t('lineItems')} />

          {lineItems.map((li, idx) => {
            const lineNet = li.lineTotal - li.lineVatAmount;
            const discAmt = parseDiscount(li.discount, li.quantity * li.unitPrice);
            return (
              <View key={li.id} style={m.lineCard}>
                <View style={m.lineCardHeader}>
                  <Text style={m.lineCardNum}>Item {idx + 1}</Text>
                  {lineItems.length > 1 && (
                    <Pressable onPress={() => removeLineItem(li.id)}>
                      <Feather name="x" size={16} color={COLORS.danger} />
                    </Pressable>
                  )}
                </View>
                <TextInput
                  style={m.descInput}
                  value={li.description}
                  onChangeText={v => updateLineItem(li.id, 'description', v)}
                  placeholder={t('product')}
                  placeholderTextColor={COLORS.muted}
                />
                <TextInput
                  style={m.periodInput}
                  value={li.period || ''}
                  onChangeText={v => updateLineItem(li.id, 'period', v)}
                  placeholder={t('period')}
                  placeholderTextColor={COLORS.muted + '80'}
                />
                <View style={m.lineGrid}>
                  {([
                    [t('quantity'), 'quantity', 'decimal-pad'],
                    [t('unit'), 'unit', 'default'],
                  ] as [string, string, any][]).map(([lbl, field, kb]) => (
                    <View key={field} style={m.lineGridCell}>
                      <Text style={m.lineGridLabel}>{lbl}</Text>
                      <TextInput
                        style={m.lineGridInput}
                        value={field === 'unit' ? li.unit : String(li[field as keyof InvoiceLineItem] ?? '')}
                        onChangeText={v => updateLineItem(li.id, field, v)}
                        keyboardType={kb}
                        placeholderTextColor={COLORS.muted}
                        textAlign="center"
                      />
                    </View>
                  ))}
                  <View style={m.lineGridCell}>
                    <Text style={m.lineGridLabel}>{t('unitPrice')}</Text>
                    <TextInput
                      style={m.lineGridInput}
                      value={rawUnitPrices[li.id] !== undefined ? rawUnitPrices[li.id] : String(li.unitPrice ?? '')}
                      onChangeText={v => setRawUnitPrices(prev => ({ ...prev, [li.id]: v }))}
                      onBlur={() => {
                        const raw = rawUnitPrices[li.id] ?? String(li.unitPrice);
                        updateLineItem(li.id, 'unitPrice', raw);
                        setRawUnitPrices(prev => { const next = { ...prev }; delete next[li.id]; return next; });
                      }}
                      keyboardType="default"
                      placeholderTextColor={COLORS.muted}
                      textAlign="center"
                    />
                  </View>
                </View>
                <View style={m.discRow}>
                  <Text style={m.discLabel}>{t('discountLabel')}</Text>
                  <TextInput
                    style={m.discInput}
                    value={li.discount}
                    onChangeText={v => updateLineItem(li.id, 'discount', v)}
                    placeholder="e.g. 10%, 15"
                    placeholderTextColor={COLORS.muted + '60'}
                  />
                </View>
                <View style={m.itemVatRow}>
                  {VAT_PRESETS.map(pct => (
                    <Pressable
                      key={pct}
                      style={[m.presetChip, li.vatPercent === pct && m.presetChipActive]}
                      onPress={() => updateLineItem(li.id, 'vatPercent', String(pct))}
                    >
                      <Text style={[m.presetChipText, li.vatPercent === pct && m.presetChipTextActive]}>{pct}%</Text>
                    </Pressable>
                  ))}
                  <View style={m.vatToggleRow}>
                    <Switch
                      value={li.vatIncluded ?? false}
                      onValueChange={v => toggleLineItemVat(li.id, v)}
                      trackColor={{ true: COLORS.primary }}
                      thumbColor={COLORS.background}
                    />
                    <Text style={m.vatToggleLabel}>{(li.vatIncluded ?? false) ? t('vatIncluded') : t('vatExcluded')}</Text>
                  </View>
                </View>
                <View style={m.lineTotalsRow}>
                  <Text style={m.lineTotalsMeta}>{t('net')}: <Text style={{ color: COLORS.text }}>{formatCurrency(lineNet, currency)}</Text></Text>
                  {discAmt > 0 && <Text style={m.lineTotalsMeta}>{t('discountLabel')}: <Text style={{ color: COLORS.text }}>{formatCurrency(discAmt, currency)}</Text></Text>}
                  <Text style={m.lineTotalsMeta}>VAT: <Text style={{ color: COLORS.text }}>{formatCurrency(li.lineVatAmount, currency)}</Text></Text>
                  <Text style={m.lineTotalsTotal}>{formatCurrency(li.lineTotal, currency)}</Text>
                </View>
              </View>
            );
          })}

          <Pressable style={m.addItemBtn} onPress={addLineItem}>
            <Feather name="plus" size={14} color={COLORS.primary} />
            <Text style={m.addItemText}>{t('addItem')}</Text>
          </Pressable>

          {/* ── 5. PAYMENT DETAILS ── */}
          {(settings.iban || settings.bic) && (
            <>
              <SectionLabel label={t('paymentDetails')} />
              <View style={m.card}>
                {settings.iban ? <View style={m.payRow}><Text style={m.payKey}>IBAN</Text><Text style={m.payVal}>{settings.iban}</Text></View> : null}
                {settings.bic ? <View style={m.payRow}><Text style={m.payKey}>BIC/SWIFT</Text><Text style={m.payVal}>{settings.bic}</Text></View> : null}
                {paymentTerms ? <View style={m.payRow}><Text style={m.payKey}>{t('paymentTerms')}</Text><Text style={m.payVal}>{paymentTerms}</Text></View> : null}
              </View>
            </>
          )}

          {/* ── 6. TOTALS ── */}
          <SectionLabel label={t('grandTotal')} />
          <View style={m.card}>
            <View style={m.totalRow}><Text style={m.totalLabel}>{t('subtotal')}</Text><Text style={m.totalVal}>{formatCurrency(netSubtotal, currency)}</Text></View>
            {vatGroups.map(({ pct, vat }) => (
              <View key={pct} style={m.totalRow}>
                <Text style={m.totalLabel}>{t('vatGroup')} {pct}%</Text>
                <Text style={m.totalVal}>{formatCurrency(vat, currency)}</Text>
              </View>
            ))}
            <View style={m.totalRow}><Text style={m.totalLabel}>{t('vatTotal')}</Text><Text style={m.totalVal}>{formatCurrency(vatTotal, currency)}</Text></View>
            <View style={m.totalDivider} />
            <View style={m.totalRow}><Text style={m.grandTotalLabel}>{t('grandTotal')}</Text><Text style={m.grandTotalVal}>{formatCurrency(grandTotal, currency)}</Text></View>
            <View style={m.amountDue}>
              <Text style={m.amountDueLabel}>Total Amount</Text>
              <Text style={m.amountDueVal}>{formatCurrency(grandTotal, currency)}</Text>
            </View>
          </View>

          {/* ── 7. NOTES ── */}
          <SectionLabel label={t('notes')} />
          <TextInput
            style={m.notesInput}
            value={additionalInfo}
            onChangeText={setAdditionalInfo}
            placeholder={t('additionalInfo')}
            placeholderTextColor={COLORS.muted}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />

          {/* ── STATUS ── */}
          <SectionLabel label={t('status')} />
          <View style={m.chipRow}>
            {(['draft', 'sent', 'paid', 'overdue'] as Invoice['status'][]).map(s => {
              const col = STATUS_COLORS[s];
              return (
                <Pressable key={s} style={[m.chip, status === s && { backgroundColor: col + '20', borderColor: col }]} onPress={() => setStatus(s)}>
                  <Text style={[m.chipText, status === s && { color: col }]}>{t(s)}</Text>
                </Pressable>
              );
            })}
          </View>

          {/* ── CREATE BUTTON ── */}
          <Pressable style={m.createBtn} onPress={handleSave}>
            <Text style={m.createBtnText}>✓ {t('createInvoice')}</Text>
          </Pressable>

          <View style={{ height: insets.bottom + 20 }} />
        </ScrollView>
      </KeyboardAvoidingView>
      {showIssueDatePicker && (
        <DatePickerModal
          visible={showIssueDatePicker}
          value={issueDate}
          onConfirm={d => {
            setIssueDate(d);
            setDueDate(calcDueDateStr(d, paymentTerms));
            setShowIssueDatePicker(false);
          }}
          onCancel={() => setShowIssueDatePicker(false)}
          title={t('issueDate')}
        />
      )}
      {showDueDatePicker && (
        <DatePickerModal
          visible={showDueDatePicker}
          value={dueDate}
          onConfirm={d => { setDueDate(d); setShowDueDatePicker(false); }}
          onCancel={() => setShowDueDatePicker(false)}
          title={t('dueDate')}
        />
      )}
      {dialog}
    </Modal>
  );
}

// ─── Helper components ───────────────────────────────────────────────────────

function SectionLabel({ label }: { label: string }) {
  const m = makeM();
  return (
    <View style={m.sectionLabelRow}>
      <Text style={m.sectionLabel}>{label}</Text>
      <View style={m.sectionDivider} />
    </View>
  );
}

function Field({ label, value, onChangeText, keyboardType }: {
  label: string; value: string; onChangeText: (v: string) => void; keyboardType?: any;
}) {
  const m = makeM();
  return (
    <View style={{ marginBottom: 10 }}>
      <Text style={m.fieldLabel}>{label}</Text>
      <TextInput style={m.input} value={value} onChangeText={onChangeText} keyboardType={keyboardType} placeholderTextColor={COLORS.muted} />
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const makeStyles = () => StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 12 },
  screenTitle: { fontSize: 24, fontWeight: '700', color: COLORS.text, letterSpacing: -0.5 },
  addBtn: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.primaryDim, borderWidth: 1, borderColor: COLORS.primary + '40' },
  summaryRow: { flexDirection: 'row', backgroundColor: COLORS.card, marginHorizontal: 16, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, marginBottom: 10, overflow: 'hidden' },
  summaryItem: { flex: 1, alignItems: 'center', paddingVertical: 12, gap: 3 },
  summaryDivider: { width: 1, backgroundColor: COLORS.border },
  summaryLabel: { fontSize: 10, color: COLORS.muted, textTransform: 'uppercase', letterSpacing: 0.8 },
  summaryValue: { fontSize: 15, fontWeight: '700', letterSpacing: -0.3 },
  unpaidBanner: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginHorizontal: 16, marginBottom: 8, backgroundColor: COLORS.card, borderRadius: 12, borderWidth: 1, borderColor: COLORS.danger + '30', paddingHorizontal: 14, paddingVertical: 10 },
  unpaidCount: { fontSize: 12, fontWeight: '700', color: COLORS.danger },
  unpaidAmt: { fontSize: 10, color: COLORS.muted },
  unpaidLink: { fontSize: 10, fontWeight: '700', color: COLORS.danger },
  filterScroll: { flexShrink: 1, flexGrow: 0 },
  filterRow: { paddingHorizontal: 16, gap: 6, paddingBottom: 4, paddingTop: 4, alignItems: 'center' },
  filterPill: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 32, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 16, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.card },
  filterText: { fontSize: 11, fontWeight: '600', color: COLORS.muted },
  empty: { alignItems: 'center', paddingTop: 80, gap: 12 },
  emptyText: { fontSize: 15, color: COLORS.muted },
  emptyBtn: { backgroundColor: COLORS.primaryDim, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20, borderWidth: 1, borderColor: COLORS.primary + '40', marginTop: 4 },
  emptyBtnText: { fontSize: 13, fontWeight: '600', color: COLORS.primary },
});

const makeM = () => StyleSheet.create({
  // Modal header
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: COLORS.primary + '20' },
  cancel: { fontSize: 15, color: COLORS.textSecondary },
  title: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  invNum: { fontSize: 10, color: COLORS.primary, fontWeight: '600', marginTop: 1 },
  saveBtn: { fontSize: 15, fontWeight: '700', color: COLORS.primary },
  body: { paddingHorizontal: 16, paddingTop: 16, gap: 8 },

  // Section
  sectionLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, marginBottom: 4 },
  sectionLabel: { fontSize: 11, color: COLORS.primary, textTransform: 'uppercase', letterSpacing: 1.2, fontWeight: '700' },
  sectionDivider: { flex: 1, height: 1, backgroundColor: COLORS.primary + '30' },

  // Cards
  card: { backgroundColor: COLORS.card, borderRadius: 16, borderWidth: 1, borderColor: COLORS.border + '80', padding: 12, marginBottom: 4 },
  cardRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  cardTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  cardTitle: { fontSize: 10, color: COLORS.primary, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.2 },
  cardClose: { fontSize: 11, color: COLORS.textSecondary },

  // FROM summary
  fromName: { fontSize: 13, fontWeight: '700', color: COLORS.text, marginBottom: 2 },
  fromMeta: { fontSize: 10, color: COLORS.muted, marginBottom: 1 },
  editChip: { backgroundColor: COLORS.primaryDim, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: COLORS.primary + '40' },
  editChipText: { fontSize: 9, fontWeight: '700', color: COLORS.primary, textTransform: 'uppercase', letterSpacing: 0.8 },

  // Fields
  fieldLabel: { fontSize: 10, fontWeight: '600', color: COLORS.muted, textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 5 },
  input: { backgroundColor: COLORS.input, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border + '60', color: COLORS.text, fontSize: 13, paddingHorizontal: 12, paddingVertical: 10 },
  twoCol: { flexDirection: 'row', gap: 8 },

  // Invoice details grid
  detailsGrid: { flexDirection: 'row' },
  detailsCell: { flex: 1, paddingHorizontal: 12, paddingVertical: 10 },
  detailsCellBorder: { borderLeftWidth: 1, borderLeftColor: COLORS.border + '50' },
  detailsDivider: { height: 1, backgroundColor: COLORS.border + '50' },
  detailInput: { color: COLORS.text, fontSize: 13, paddingVertical: 2 },
  invNumDisplay: { fontSize: 14, fontWeight: '700', color: COLORS.primary },

  // Chips
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 6 },
  chip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: COLORS.border + '80', backgroundColor: COLORS.card },
  chipActive: { backgroundColor: COLORS.primaryDim, borderColor: COLORS.primary },
  chipText: { fontSize: 12, fontWeight: '500', color: COLORS.muted },
  chipTextActive: { color: COLORS.primary, fontWeight: '600' },

  // VAT bar
  vatBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: COLORS.card, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border + '80', paddingHorizontal: 12, paddingVertical: 10, marginBottom: 4 },
  vatToggleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  vatToggleLabel: { fontSize: 11, color: COLORS.textSecondary },
  presetRow: { flexDirection: 'row', gap: 5 },
  presetChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1, borderColor: COLORS.border + '80' },
  presetChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  presetChipText: { fontSize: 10, fontWeight: '700', color: COLORS.muted },
  presetChipTextActive: { color: COLORS.background },

  // Line item card
  lineCard: { backgroundColor: COLORS.card, borderRadius: 16, borderWidth: 1, borderColor: COLORS.border + '80', marginBottom: 8, overflow: 'hidden' },
  lineCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 12, paddingTop: 10, paddingBottom: 4 },
  lineCardNum: { fontSize: 9, fontWeight: '700', color: COLORS.primary, textTransform: 'uppercase', letterSpacing: 1.2 },
  descInput: { fontSize: 14, fontWeight: '600', color: COLORS.text, paddingHorizontal: 12, paddingBottom: 4 },
  periodInput: { fontSize: 11, color: COLORS.muted, paddingHorizontal: 12, paddingBottom: 8 },
  lineGrid: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: COLORS.border + '50' },
  lineGridCell: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRightWidth: 1, borderRightColor: COLORS.border + '50' },
  lineGridLabel: { fontSize: 8, color: COLORS.muted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 },
  lineGridInput: { fontSize: 12, color: COLORS.text, backgroundColor: COLORS.surface, borderRadius: 6, paddingHorizontal: 4, paddingVertical: 5, width: '85%' },
  discRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderTopWidth: 1, borderTopColor: COLORS.border + '50', gap: 8 },
  itemVatRow: { flexDirection: 'row', gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderTopWidth: 1, borderTopColor: COLORS.border + '50' },
  discLabel: { fontSize: 9, color: COLORS.muted, textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: '600' },
  discInput: { flex: 1, fontSize: 11, color: COLORS.text, textAlign: 'right', backgroundColor: COLORS.surface, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  lineTotalsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 8, paddingHorizontal: 12, paddingVertical: 9, backgroundColor: COLORS.surface, borderTopWidth: 1, borderTopColor: COLORS.border + '30' },
  lineTotalsMeta: { fontSize: 10, color: COLORS.muted },
  lineTotalsTotal: { fontSize: 13, fontWeight: '700', color: COLORS.text },

  // Add item button
  addItemBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderStyle: 'dashed', borderColor: COLORS.primary + '40', borderRadius: 16, paddingVertical: 14, marginBottom: 4 },
  addItemText: { fontSize: 12, fontWeight: '700', color: COLORS.primary, textTransform: 'uppercase', letterSpacing: 1 },

  // Payment details
  payRow: { flexDirection: 'row', gap: 12, marginBottom: 6 },
  payKey: { fontSize: 9, fontWeight: '700', color: COLORS.muted, textTransform: 'uppercase', letterSpacing: 1, width: 76 },
  payVal: { fontSize: 11, color: COLORS.text, fontFamily: 'monospace', flex: 1 },

  // Totals
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  totalLabel: { fontSize: 12, color: COLORS.textSecondary },
  totalVal: { fontSize: 12, fontWeight: '600', color: COLORS.text },
  totalDivider: { height: 1, backgroundColor: COLORS.border + '50', marginVertical: 8 },
  grandTotalLabel: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  grandTotalVal: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  amountDue: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: COLORS.primary + '10', borderRadius: 10, borderWidth: 1, borderColor: COLORS.primary + '20', paddingHorizontal: 14, paddingVertical: 11, marginTop: 8 },
  amountDueLabel: { fontSize: 13, fontWeight: '600', color: COLORS.primary },
  amountDueVal: { fontSize: 15, fontWeight: '700', color: COLORS.primary },

  // Notes
  notesInput: { backgroundColor: COLORS.card, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border + '60', color: COLORS.text, fontSize: 13, padding: 12, minHeight: 80, marginBottom: 4 },

  // Create button
  createBtn: { backgroundColor: COLORS.primary, borderRadius: 12, alignItems: 'center', paddingVertical: 16, marginTop: 12 },
  createBtnText: { fontSize: 13, fontWeight: '700', color: COLORS.background, textTransform: 'uppercase', letterSpacing: 1 },
});
