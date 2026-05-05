# Skill: Supabase Patterns for Scandinordic Pro

## Client
Always import from `lib/supabase.ts`. Never create a new client.
```ts
import { supabase } from '@/lib/supabase';
```

## Fetch pattern
```ts
const fetchData = async () => {
  const { data, error } = await supabase
    .from('table_name')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[table_name] fetch failed:', error);
    setErrorMessage(error.message); // always show in UI
    return;
  }
  setData(data ?? []);
};
```

## Insert pattern
```ts
const handleSave = async () => {
  console.log('[table_name] inserting:', payload); // always log payload
  
  const { error } = await supabase
    .from('table_name')
    .insert([payload]);

  if (error) {
    console.error('[table_name] insert failed:', error);
    setErrorMessage(error.message); // show red error text in modal
    return;
  }
  
  setModalVisible(false);
  resetForm();
  fetchData(); // always refresh list after insert
};
```

## Delete pattern
```ts
const { error } = await supabase
  .from('table_name')
  .delete()
  .eq('id', item.id);
```

## Common failure reasons
1. Table doesn't exist → user must run CREATE TABLE in Supabase SQL Editor
2. RLS blocking → add policy or disable RLS for development
3. Wrong column name → check exact column names in Supabase dashboard
4. Silent error → always log full error object, show message in UI

## RLS quick disable (development only)
```sql
alter table team_payroll disable row level security;
```
