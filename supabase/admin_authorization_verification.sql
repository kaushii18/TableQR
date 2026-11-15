-- Database verification script for the TableQR admin authorization model.
-- Run after migration application and before approving a production admin session.

-- 1. Check admin_users exists and required columns are present.
SELECT
    'public.admin_users exists' AS check_name,
    EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'admin_users'
    ) AS ok;

SELECT
    'user_id present' AS check_name,
    EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'admin_users' AND column_name = 'user_id'
    ) AS ok;

SELECT
    'role present' AS check_name,
    EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'admin_users' AND column_name = 'role'
    ) AS ok;

SELECT
    'can_confirm_payments present' AS check_name,
    EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'admin_users' AND column_name = 'can_confirm_payments'
    ) AS ok;

SELECT
    'least-privilege defaults and required columns' AS check_name,
    COUNT(*) = 2
        AND bool_and(is_nullable = 'NO')
        AND bool_and(
            (column_name = 'role' AND column_default LIKE '%staff%')
            OR (column_name = 'can_confirm_payments' AND column_default LIKE '%false%')
        ) AS ok
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'admin_users'
  AND column_name IN ('role', 'can_confirm_payments');

SELECT
    'authenticated cannot insert or update admin privileges' AS check_name,
    NOT has_table_privilege('authenticated', 'public.admin_users', 'INSERT')
    AND NOT has_table_privilege('authenticated', 'public.admin_users', 'UPDATE')
    AND NOT has_column_privilege('authenticated', 'public.admin_users', 'user_id', 'INSERT')
    AND NOT has_column_privilege('authenticated', 'public.admin_users', 'role', 'INSERT')
    AND NOT has_column_privilege('authenticated', 'public.admin_users', 'can_confirm_payments', 'INSERT')
    AND NOT has_column_privilege('authenticated', 'public.admin_users', 'user_id', 'UPDATE')
    AND NOT has_column_privilege('authenticated', 'public.admin_users', 'role', 'UPDATE')
    AND NOT has_column_privilege('authenticated', 'public.admin_users', 'can_confirm_payments', 'UPDATE') AS ok;

-- 2. Inventory authorization records.
SELECT
    role,
    COUNT(*) AS member_count
FROM public.admin_users
GROUP BY role
ORDER BY role;

-- 3. Verify the role model and existing admin records.
SELECT user_id, role, can_confirm_payments, created_at
FROM public.admin_users
ORDER BY created_at;

-- 4. Check that the authorization functions exist and are valid.
SELECT
    'public.is_admin() exists' AS check_name,
    EXISTS (
        SELECT 1
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'is_admin'
    ) AS ok;

SELECT
    'public.has_payment_confirmation_permission() exists' AS check_name,
    EXISTS (
        SELECT 1
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'has_payment_confirmation_permission'
    ) AS ok;

SELECT
    'public.confirm_order_payment(UUID) exists' AS check_name,
    EXISTS (
        SELECT 1
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'confirm_order_payment'
    ) AS ok;

-- 5. Confirm the expected RLS policies are present.
SELECT schemaname, tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND (tablename = 'admin_users' OR tablename = 'orders' OR tablename = 'service_requests' OR tablename = 'payment_history')
ORDER BY tablename, policyname;

-- 6. Surface any unintended public permission.
SELECT table_schema, table_name, grantee, privilege_type
FROM information_schema.table_privileges
WHERE table_schema = 'public'
  AND table_name IN ('admin_users', 'orders', 'service_requests', 'payment_history')
  AND grantee IN ('PUBLIC', 'anon', 'authenticated')
ORDER BY table_name, grantee, privilege_type;

-- Column-level grants are separate from table-level grants; check whether
-- untrusted roles can insert or update admin authorization fields.
SELECT table_schema, table_name, column_name, grantee, privilege_type
FROM information_schema.column_privileges
WHERE table_schema = 'public'
  AND table_name = 'admin_users'
  AND column_name IN ('user_id', 'role', 'can_confirm_payments')
  AND grantee IN ('PUBLIC', 'anon', 'authenticated')
  AND privilege_type IN ('INSERT', 'UPDATE')
ORDER BY column_name, grantee, privilege_type;

-- Test cases (manual verification):
-- TEST A: Existing administrator can log in and access dashboard.
-- TEST B: Manager receives permitted management access.
-- TEST C: Authorized staff can confirm payments.
-- TEST D: Unauthorized staff cannot confirm payments.
-- TEST E: Customers cannot access admin features.
--
-- Example assertions for the SQL editor:
-- SELECT public.is_admin();
-- SELECT public.has_payment_confirmation_permission();
-- SELECT public.confirm_order_payment('00000000-0000-0000-0000-000000000000');
-- -- The id above should be replaced with a valid order id to test the RPC.



