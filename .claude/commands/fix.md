# /fix — Diagnose and fix errors in the project

1. Run `npx tsc --noEmit` and collect all errors
2. Filter out pre-existing errors from CLAUDE.md (transactions.tsx, expo-file-system/legacy)
3. For each remaining error:
   - Show file + line
   - Explain the cause in plain English
   - Fix it
4. Re-run `npx tsc --noEmit` to confirm errors are gone
5. Report: "Fixed X errors. Y pre-existing errors remain (not touched)."
