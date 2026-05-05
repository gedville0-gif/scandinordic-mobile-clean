# Agent: supabase-debugger

Debug a Supabase operation that is failing silently.

Steps:
1. Read the relevant file and find the Supabase insert/select/update call
2. Add temporary console.log BEFORE the call to show exact payload
3. Check the error object — log the full error, not just error.message
4. Verify the table name matches exactly what exists in Supabase
5. Verify column names match the table schema
6. Check if RLS (Row Level Security) might be blocking the operation
   → If RLS is on, user must be authenticated or policy must allow anon
7. Add visible error text in the UI so Rash can see what failed on device

Common fixes:
- Table doesn't exist → output SQL to create it
- RLS blocking → output SQL policy to allow operation
- Wrong column name → fix the key in the insert object
- Silent catch → replace with visible error state in component

Report: exact cause + fix applied.
