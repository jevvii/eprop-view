# Supabase Storage Fix

The previous error `ERROR: 42501: must be owner of table objects` occurs because Supabase restricts direct SQL ownership changes on system tables.

### Steps to Fix

1. **Create Bucket via UI**:
   - Go to your Supabase Dashboard -> **Storage**.
   - Create a new bucket named `inspection-images`.
   - Set it to **Private**.

2. **Run Policies**:
   - Copy the SQL from `supabase/migrations/003_setup_storage.sql` and run it in the **SQL Editor**.

This bypasses the ownership restriction by letting the Dashboard handle the table activation.
