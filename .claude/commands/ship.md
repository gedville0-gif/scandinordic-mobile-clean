# /ship — Build, lint, and verify before committing

Run these steps in order and report results:

1. `npx tsc --noEmit 2>&1 | grep -v "transactions.tsx" | grep -v "expo-file-system" | grep "error TS"`
   → Report any NEW errors (not pre-existing ones listed in CLAUDE.md)

2. Check that all new strings added in this session exist in ALL 4 language 
   blocks (en, fi, sv, da) in lib/i18n.ts

3. Check that no duplicate keys exist in lib/i18n.ts

4. Confirm the Supabase client used is lib/supabase.ts (not a new instance)

5. Report a final summary:
   ✅ Ready to ship / ❌ Issues found: [list them]
