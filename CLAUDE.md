# CLAUDE.md — ScandiNordic

## 1. Project Overview

ScandiNordic is a React Native (Expo) mobile accounting app for sole traders. It tracks income/expenses, generates reports (Balance Sheet, P&L, Tax Prepayment), manages invoices, and handles receipt scanning. UI is dark-first, minimal, and branded with a gold primary color.

---

## 2. Tech Stack

- **Framework**: React Native + Expo (expo-router v6, file-based routing)
- **Language**: TypeScript (strict)
- **Backend**: Supabase
- **Local storage**: AsyncStorage (`@react-native-async-storage/async-storage`)
- **PDF**: expo-print + expo-sharing
- **Icons**: `@expo/vector-icons` (Feather only)
- **Haptics**: expo-haptics
- **Navigation**: expo-router (stack + tabs)

---

## 3. Folder Structure

```
app/
  (tabs)/         # Tab screens (index, transactions, invoices, reports, settings)
  (onboarding)/   # Onboarding flow
  reports/        # Stack screens: balance.tsx, pl.tsx, tax.tsx
components/       # Shared components (DatePickerModal, AppDialog, etc.)
constants/        # colors.ts — single source of truth for COLORS
contexts/         # ThemeContext, LanguageContext
lib/              # storage.ts, i18n.ts, currency.ts, types.ts
```

---

## 4. Coding Rules

- **No any** unless unavoidable — use proper types from `lib/types.ts`
- **useCallback** for all handlers passed as props or used in effects
- **useMemo** for derived/computed data from transactions
- **useEffect** for data loading on mount; add **useFocusEffect** when the screen must reload on every navigation focus
- All strings must go through `useLanguage()` → `t('key')` — no hardcoded English in JSX
- Conditional rendering for Modals when not visible: `{show && <Modal visible={show} ... />}` — never leave `<Modal visible={false}>` mounted (can block touches)
- Never silently swallow async errors — always wrap AsyncStorage calls in try/catch
- Do not add features, abstractions, or comments beyond what is asked

---

## 5. UI/UX Rules — CRITICAL

- **Buttons must look like buttons.** Every tappable element must have:
  - A visible background (`COLORS.surface` minimum for outlined style, `COLORS.primary` for primary actions)
  - A visible border or background that contrasts with the page background
  - Press feedback: `({ pressed }) => [style, pressed && { opacity: 0.65 }]`
- **Never use `COLORS.card` as a button background.** In dark mode `COLORS.card = rgba(255,255,255,0.04)` — nearly invisible. Use `COLORS.surface` for outlined buttons.
- **Primary action buttons** (e.g. Export PDF, Save, Confirm): `backgroundColor: COLORS.primary`, text `COLORS.background`
- **Secondary/outlined buttons** (e.g. Save Data, Cancel): `backgroundColor: COLORS.surface`, `borderWidth: 1`, `borderColor: COLORS.border`
- **No sticky footers** — action buttons live inside the scroll content, near the bottom of the page
- Pressable touch area must be at least 44×44pt — use `paddingVertical: 14` minimum
- After a successful save action, show visual confirmation (icon change, color shift) — never save silently

---

## 6. Theme Rules

- All colors come from `COLORS` in `constants/colors.ts` — never hardcode hex values in component files
- `COLORS` is a mutable singleton updated by `updateColors(mode)` — call this before reading in dynamic contexts
- Key values in dark mode:
  - `background: '#080808'`
  - `surface: '#101010'` ← use for button backgrounds
  - `card: 'rgba(255,255,255,0.04)'` ← NOT for buttons
  - `primary: (gold)` ← primary actions
  - `border: 'rgba(212,163,79,0.18)'` ← subtle gold tint
- Access current mode via `const { mode } = useTheme()`
- Dark mode overlays (modals, bottom sheets): `rgba(0,0,0,0.85)` backdrop
- Bottom sheet structure — always use this pattern:
  ```tsx
  <Modal visible={show} transparent animationType="slide">
    <View style={{ flex: 1, justifyContent: 'flex-end' }}>
      <Pressable style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.85)' }]} onPress={onClose} />
      <View style={styles.sheet}>...</View>
    </View>
  </Modal>
  ```

---

## 7. State Management

- No global state library — local `useState` per screen
- Persistent data: AsyncStorage with explicit keys (e.g. `balance_end_date`, `pl_period_dates`)
- Pattern: `load()` reads AsyncStorage on mount + on focus; `handleSaveData()` writes to AsyncStorage
- Transaction/invoice data loaded via `getTransactions()` / `getInvoices()` from `lib/storage.ts`
- Derived values (totals, filters) computed with `useMemo` — never stored in state

---

## 8. Common Mistakes to Avoid

| Mistake | Fix |
|---|---|
| `backgroundColor: COLORS.card` on a button | Use `COLORS.surface` |
| `<Modal visible={false}>` left mounted | Use `{show && <Modal visible={show}>}` |
| No press feedback on Pressable | Add `({ pressed }) => [style, pressed && { opacity: 0.65 }]` |
| Async handler with no try/catch | Always wrap in try/catch, surface errors to user |
| `handleExportPDF` defined before `computed` useMemo | Define handlers that reference computed values AFTER the useMemo |
| Hardcoded English strings in JSX | Use `t('key')` from `useLanguage()` |
| Screen data not reloading on navigation | Add `useFocusEffect(useCallback(() => { load(); }, [load]))` |
| Direct siblings of Modal (overlay + sheet) | Always wrap in a flex container with absoluteFillObject backdrop |

---

## 9. Instructions for AI

- **Read the file before editing it** — never guess at existing code
- **Edit only what was asked** — do not refactor, rename, or "improve" surrounding code
- **React Native only** — no web APIs, no DOM, no CSS
- **Write files to disk** — always apply changes to the actual files
- **Keep the ScandiNordic UI** — do not redesign screens, change layout, or alter Export PDF
- When fixing a button: fix background, add press feedback, verify onPress wires to the correct handler
- When fixing a modal/sheet: use the absoluteFillObject pattern, always conditionally render
- When adding persistence: use AsyncStorage + useFocusEffect for reload
- Do not add i18n keys unless explicitly asked
- Do not add dependencies unless they are already in package.json
