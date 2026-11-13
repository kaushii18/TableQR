# TableQR Admin Panel

Separate restaurant operations app for Star Planet Family Restaurant & Bar. The existing customer app remains in `customer-app/`.

## Local setup

1. Install the admin app dependencies:

   ```powershell
   cd admin-panel
   npm install
   ```

2. Copy `.env.example` to `.env` and set the existing Supabase project URL and **public anon/publishable key**. Set `VITE_CUSTOMER_APP_URL` to the customer app origin (defaults to `http://localhost:5173` for local development).
3. Review `../supabase/migrations/20261111_admin_panel.sql`. It has **not** been run. Apply it manually in Supabase only after approving the policy and schema changes described below.
4. Create an email/password staff user in Supabase Auth. After applying the migration, grant that user the admin role using the Supabase SQL editor:

   ```sql
   INSERT INTO public.admin_users (user_id)
   SELECT id FROM auth.users WHERE email = 'admin@example.com';
   ```

   Replace the example email with the staff account's email. Do not expose a service-role key in the browser.
5. Start the customer app in one terminal and the admin app in another:

   ```powershell
   cd customer-app
   npm run dev
   ```

   ```powershell
   cd admin-panel
   npm run dev
   ```

   The admin app is served at `http://localhost:5174`.
6. On the Menu page, use **Import customer menu** to copy the existing 380 local items and 10 menu categories into the database. Import matches records by their original `legacy_id`, so repeating it updates those imported rows rather than making duplicates. Then explicitly choose **Publish menu** when ready to switch customer ordering to database menu records.

## Features

- Password login, persisted Supabase session, admin role check, protected pages, and logout. Public signup is not provided.
- Order pages update through Supabase Realtime with a 30-second polling fallback; service requests update through Realtime.
- Order search, status/date filters, order detail, totals, and status updates.
- Menu item and category CRUD, category ordering, item availability, and safe category deletion checks.
- Restaurant table CRUD and downloadable QR PNGs using the customer app's existing `?table=...` URL behavior.
- Database-backed overview statistics and empty/loading/error states.

## Database/security review before migration

The existing `customer-app/supabase_schema.sql` defines only `public.orders` and `public.service_requests`. It grants anonymous `SELECT` and `UPDATE` on both tables, so anyone with the public key can read customer/order details and alter order or request status. The customer flow currently needs anonymous `INSERT` on these two tables; a source search found no customer UI using the old all-orders fetch or status-update helpers.

The proposed migration:

- Adds `admin_users`, `menu_categories`, `menu_items`, and `restaurant_tables`.
- Adds `menu_settings` with publication disabled by default; the customer app keeps the checked-in menu until an administrator explicitly publishes the database menu.
- Adds `public.is_admin()` as a `SECURITY DEFINER` role check with an empty `search_path`, and limits its execution to authenticated users.
- Removes the six broad policies named in the existing schema. Anonymous access is reduced to inserting orders and service requests. Reads and updates on these operational records require an admin role.
- Allows public reads of the menu tables so they can be used by the customer menu, while limiting writes to admins. Only admins can access restaurant tables.
- Adds foreign-key and value constraints, including preventing deletion of a category that still has menu items.

The guest insert policies intentionally remain open to support QR ordering and waiter calls. They constrain new orders to the `received` status, validate basic non-empty/order-total fields and require item arrays, and constrain service requests to `pending`; they still allow forged/spam inserts and should be hardened with server-side validation/rate limiting if abuse becomes a concern. Review all project-specific policies and grants in Supabase before applying: policies are permissive when combined, and any additional existing policy may preserve access beyond the six in the checked-in schema. The migration is a proposal only; this project does not execute it.

The menu migration creates empty tables. Importing the checked-in local menu is an explicit, confirmed action from the admin UI; it preserves current availability values when repeating an import. Publishing the database menu is a separate explicit action. Until then, the customer app uses the checked-in menu. Once published, it maps database records into its existing menu shape and preserves the existing `?table=...` ordering behavior.

## Environment and deployment

- `VITE_SUPABASE_URL`: shared Supabase project URL.
- `VITE_SUPABASE_ANON_KEY` (or `VITE_SUPABASE_PUBLISHABLE_KEY`): public client key; it is expected to be visible to browsers and must be protected by RLS.
- `VITE_CUSTOMER_APP_URL`: deployed customer-app origin used by generated QR codes.

Never set a service-role key in a `VITE_*` variable or browser bundle. Deploy the admin app only over HTTPS and restrict Supabase Auth users to staff who require access.

## Validation status

Both apps passed production builds and lint. QR PNG generation and browser smoke checks passed for the unconfigured admin login, mobile viewport, existing `?table=18` customer QR flow, and unchanged built-in menu. The customer build reports a bundle-size advisory above 500 kB.

The admin runtime dependency audit (`npm audit --omit=dev`) found no vulnerabilities. The full development dependency audit reports four moderate findings through `minimatch` under ESLint 10; npm's suggested forced fix would downgrade ESLint to v9, so no breaking lint-toolchain change was made.

Live Supabase authentication, RLS policy behavior, Realtime delivery, and CRUD require the reviewed migration and configured project; they were not run or verified here.
