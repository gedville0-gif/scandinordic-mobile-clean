# /addfeature [feature name] — Scaffold a new feature

Before building, confirm:
1. Which tab does this belong to? (Koti/Tiimi/Tulot/Raportit/Asetukset)
2. Does it need a new Supabase table? If yes, output the SQL CREATE TABLE 
   statement for Rash to run in Supabase dashboard first.
3. Does it need new i18n strings? List them all before writing code.

Then build the feature:
- Add to existing tab file (no new routes unless asked)
- Use existing Supabase client (lib/supabase.ts)
- Match existing COLORS, font, and component patterns
- Add all strings to en, fi, sv, da in lib/i18n.ts
- Run /ship at the end
