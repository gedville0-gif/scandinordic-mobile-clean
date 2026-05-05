# Agent: code-reviewer

Review the most recently changed files in this session.

Check for:
1. **TypeScript errors** — any new ones not in CLAUDE.md pre-existing list
2. **i18n compliance** — all new UI strings use t() calls, exist in all 4 languages
3. **Supabase safety** — uses lib/supabase.ts, no new client instances, errors surfaced in UI
4. **Design consistency** — uses COLORS constants, matches existing component patterns
5. **No forbidden files touched** — transactions.tsx, googleVision/, Deno/
6. **Finnish compliance** — VAT rates correct (14% food, 25.5% general), payroll rates correct

Return a report:
✅ PASS / ⚠️ WARNING / ❌ FAIL for each check
Then: "Ready to ship" or "Fix these issues first: [list]"
