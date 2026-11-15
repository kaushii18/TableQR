# TableQR admin authorization remediation

This repository stores the data-model fix as a forward-only migration under `supabase/migrations/20261115_admin_users_authorization_fix.sql`.

## Why a new migration is required

The original `20261111_admin_panel.sql` creates `public.admin_users` with only `user_id` and `created_at`. The frontend correctly queries `role` and `can_confirm_payments`; `20261114_payment_management.sql` is the migration that adds them. Therefore, the reported missing-column error means the connected Supabase project's schema does not match the newer application code—most directly because the payment migration (or the corrective migration below) was not applied to that project, or was applied to a different project. The frontend should not hide this error or guess a role when the authorization schema is missing.

`Could not verify admin access: column admin_users.role does not exist`

The correct fix is not a frontend fallback. The database schema must be corrected and the authorization function must be aligned with the current table design.

## Required authorization model

The authoritative table is `public.admin_users`.

- `user_id` identifies the authenticated Supabase user.
- `role` is one of `admin`, `manager`, or `staff`.
- `can_confirm_payments` is `true` only when an authorized staff member may confirm payment records.
- Existing records created before the role model was introduced must be preserved and treated as administrators.
- New rows should default to the least privilege: `staff` with `can_confirm_payments = false`.

The database functions enforce the model:

- `public.is_admin()` returns `true` only for `auth.uid()` matching an `admin_users` row with `role = 'admin'`.
- `public.has_payment_confirmation_permission()` returns `true` for admins, managers, or explicitly permitted staff.
- `public.confirm_order_payment(UUID)` validates authorization before writing payment confirmation records.

## Apply the corrective migration safely

1. Confirm the project target in both apps points to the intended Supabase project.
2. Open the Supabase SQL editor for that project.
3. Check the migration history in the database and confirm whether the earlier migrations were applied.
4. Apply `supabase/migrations/20261115_admin_users_authorization_fix.sql` to the connected project. It is a forward-only correction for schema drift and can run after either earlier migration; it checks that `orders` and `service_requests` already exist and requests a PostgREST schema-cache reload after commit.
5. Run the verification script at `supabase/admin_authorization_verification.sql`.
6. Re-test the admin login flow and payment confirmation flow.

Do not re-run historical migrations. Do not delete rows or drop the table. The fix is additive and idempotent.

## Database drift detection procedure

Use these checks to detect a migration-history/schema mismatch before relying on the admin panel:

```sql
SELECT *
FROM information_schema.tables
WHERE table_schema = 'public' AND table_name = 'admin_users';

SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'admin_users'
ORDER BY ordinal_position;

SELECT pr.oid::regprocedure AS function_name
FROM pg_proc pr
JOIN pg_namespace ns ON ns.oid = pr.pronamespace
WHERE ns.nspname = 'public' AND pr.proname IN ('is_admin', 'has_payment_confirmation_permission', 'confirm_order_payment');

SELECT schemaname, tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public';
```

If the schema and migration history disagree, do not assume the app is fixed. Apply the corrective migration and verify the live database before giving a user access.

## Verification checklist

- `public.admin_users` exists.
- `user_id`, `role`, and `can_confirm_payments` are present.
- Existing allowlisted admin rows remain authorized.
- Rows in a legacy allowlist with a missing or `NULL` role are preserved as admins; invalid non-null role values are repaired to `staff`.
- New rows default to `staff` and `can_confirm_payments = false`.
- Unauthorized users cannot update `role` or `can_confirm_payments`.
- `public.is_admin()` rejects unauthenticated requests and fails closed.
- Payment confirmation functions and RLS policies still require explicit authorization.

## Notes on project configuration

Both apps should use the same Supabase project URL and anon/publishable key. If the admin panel and customer app are configured to different Supabase projects, the admin app will not be able to verify the same `public.admin_users` rows. Resolve the project mismatch before approving a role change or migration.

Never expose service-role keys, private keys, passwords, or bearer tokens in browser code or source control.
