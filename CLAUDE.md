# Scandinordic Pro — Mobile App
> Claude Code reads this every session. Keep it under 200 lines.

## Project
- **App:** Scandinordic Pro — Finnish/Scandinavian business finance app
- **Platform:** React Native + Expo (local build: scandinordic-mobile-clean)
- **Backend:** Supabase — client is in `lib/supabase.ts`, never create a new one
- **Design:** Dark gold luxury theme — COLORS constants in `constants/Colors.ts`
- **Fonts:** Cormorant Garamond (headings) + DM Mono (numbers/labels)
- **i18n:** 4 languages — `en, fi, sv, da` all in `lib/i18n.ts`
- **Tabs:** Koti, Tiimi, Tulot, Raportit, Asetukset

## Owner
- Rash (solo founder, no-code background — keep explanations clear)
- Building with Claude Code exclusively

## Hard Rules
1. NEVER touch `transactions.tsx`, `googleVision/`, or `Deno/` files
2. ALWAYS run `npx tsc --noEmit` after every change — fix errors YOU introduced
3. NEVER create a new Supabase client — use the existing one in `lib/supabase.ts`
4. ALL new UI strings go into ALL 4 language blocks in `lib/i18n.ts` (en, fi, sv, da)
5. NO duplicate keys in `lib/i18n.ts` — check before adding
6. Match existing patterns: `TouchableOpacity` not `Pressable`, existing style patterns
7. Check Supabase table exists before inserting — surface errors visibly in UI, not just console
8. Never create new routes/tabs unless explicitly asked

## Pre-existing Errors (DO NOT FIX unless asked)
- `expo-file-system/legacy` missing module → `transactions.tsx`
- `TS2322` null filter on Transaction type → `transactions.tsx`
- `lib/i18n.ts` duplicate key warnings (vatPayable, elapsed) — already resolved

## Supabase Tables (created so far)
- `team_payroll` — id, name, role, gross_salary, hours_per_month, tax_rate_override, created_at

## Finnish VAT Rates (ALV 2026)
- Food/groceries: 13.5%
- General/fuel/services: 25.5%
- Special (books/newspapers): 10%
- Zero-rated: 0%
- Exempt: no VAT

## Finnish Payroll Rates (2025)
- Employee: TyEL 7.45%, TVR 0.79%, SV 1.53%
- Employer: TyEL 17.34%, TVR 1.32%, SV 1.53%
- Progressive income tax brackets unless tax_rate_override is set
