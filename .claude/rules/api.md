# API Rules (applies to lib/supabase.ts and all Supabase calls)

- Always use the existing client from lib/supabase.ts
- Never hardcode Supabase URL or anon key in component files
- Always handle both `data` and `error` from every Supabase call
- Surface errors as visible UI text, not just console.error
- After any insert/update/delete, call the relevant fetch function to refresh state
- Log the full payload before every insert (console.log) for debugging
