# Order status and customer tracking

## Apply the migration

Apply `migrations/20261115235100_order_status_tracking.sql` to the same Supabase project used by both apps, after `20261111_admin_panel.sql`, `20261114_payment_management.sql`, and `20261115_admin_users_authorization_fix.sql` have established the order schema and authorization model. The tracking migration is forward-only and idempotent. Do not edit or replay earlier migrations.

The migration:

- Adds a unique UUID tracking token to each order. Existing rows receive tokens, but their existing status and payment values are not changed.
- Adds `ready` to the existing `orders.status` constraint while retaining `received`, `preparing`, `served`, `completed`, and `cancelled`.
- Explicitly revokes table- and column-level `SELECT` from `anon` and `PUBLIC`.
- Adds `get_customer_order_tracking_status(UUID)`, which returns only the matching order's status. The token is a bearer credential; do not put it in URLs, logs, or analytics.
- Does not grant or change order-update privileges, RLS policies, payment-column grants, or payment confirmation authorization.

The order update permissions come from the earlier authorization migration, not from the tracking migration. Authenticated users have SQL `UPDATE(status)` privilege, but the `"Admins can update orders"` RLS policy requires `public.is_admin()` for both `USING` and `WITH CHECK`; that function accepts only role `admin`. Thus an authenticated staff or payment-only manager is not allowed to update order status. The payment fields `payment_status`, `payment_confirmed_at`, and `payment_confirmed_by` are not directly updateable by authenticated users; payment changes remain through the authorized RPC.

Customer tracking uses a cryptographically generated UUID token supplied with the order insert, keeps it in that browser's local storage, and polls the status-only RPC every 10 seconds. It intentionally does not subscribe to `orders` changes because that would require anonymous table `SELECT`. Admin Orders and Payments continue to read the same persisted `orders.status`; their existing Realtime subscriptions and polling remain in place.

## Verify after applying

Run these read-only checks in the Supabase SQL Editor:

```sql
SELECT
    has_table_privilege('anon', 'public.orders', 'SELECT') AS anon_can_select_orders,
    has_column_privilege('anon', 'public.orders', 'status', 'SELECT') AS anon_can_select_status,
    has_column_privilege('authenticated', 'public.orders', 'status', 'UPDATE') AS authenticated_has_status_sql_privilege,
    has_column_privilege('authenticated', 'public.orders', 'payment_status', 'UPDATE') AS authenticated_can_update_payment_status,
    has_column_privilege('authenticated', 'public.orders', 'payment_confirmed_at', 'UPDATE') AS authenticated_can_update_confirmation_time,
    has_column_privilege('authenticated', 'public.orders', 'payment_confirmed_by', 'UPDATE') AS authenticated_can_update_confirmer;

SELECT table_schema, table_name, grantee, privilege_type
FROM information_schema.table_privileges
WHERE table_schema = 'public'
  AND table_name = 'orders'
  AND grantee IN ('PUBLIC', 'anon')
  AND privilege_type = 'SELECT';

SELECT table_schema, table_name, column_name, grantee, privilege_type
FROM information_schema.column_privileges
WHERE table_schema = 'public'
  AND table_name = 'orders'
  AND grantee IN ('PUBLIC', 'anon')
  AND privilege_type = 'SELECT'
ORDER BY grantee, column_name;

SELECT policyname, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'orders'
  AND policyname = 'Admins can update orders';

SELECT pg_get_functiondef('public.is_admin()'::regprocedure);

SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'public.orders'::regclass
  AND contype = 'c'
  AND pg_get_constraintdef(oid) ILIKE '%status%';

SELECT has_function_privilege(
    'anon',
    'public.get_customer_order_tracking_status(uuid)',
    'EXECUTE'
) AS anon_can_call_tracking_rpc;
```

The first query's anonymous table and column checks should be `false`. The two privilege-listing queries should return no anonymous or `PUBLIC` `SELECT` grants. The authenticated status SQL privilege should be `true`, but that alone does **not** authorize every authenticated user: verify the policy is `UPDATE`, applies to `authenticated`, and both expressions call `public.is_admin()`. The three payment-column update checks should be `false`. The function execution check should be `true`. To test the RPC, use a real tracking token from the browser that placed the order:

```sql
SELECT public.get_customer_order_tracking_status('<tracking-token>'::uuid);
```

It should return only the `status` column for a valid token and no row for an unknown token. The client generates UUID v4 tokens from Web Crypto's cryptographically secure random source; the database enforces uniqueness. Never test by changing a production order's status or payment fields. New customer tracking tokens are not available to older browser sessions that predate this migration; those orders still retain their existing database status.
