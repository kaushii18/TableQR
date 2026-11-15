BEGIN;

DO $$
DECLARE
    has_role_column BOOLEAN;
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'admin_users'
    ) THEN
        CREATE TABLE public.admin_users (
            user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
            role TEXT NOT NULL DEFAULT 'staff' CHECK (role IN ('admin', 'manager', 'staff')),
            can_confirm_payments BOOLEAN NOT NULL DEFAULT false,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'orders'
    ) OR NOT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'service_requests'
    ) THEN
        RAISE EXCEPTION 'Apply the admin-panel migration first; public.orders and public.service_requests are required.';
    END IF;

    SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'admin_users'
          AND column_name = 'role'
    )
    INTO has_role_column;

    IF NOT has_role_column THEN
        -- With no role column, existing rows are the legacy admin allowlist.
        ALTER TABLE public.admin_users ADD COLUMN role TEXT;
        UPDATE public.admin_users SET role = 'admin';
    END IF;

    ALTER TABLE public.admin_users
        ADD COLUMN IF NOT EXISTS can_confirm_payments BOOLEAN,
        ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;

    ALTER TABLE public.admin_users
        DROP CONSTRAINT IF EXISTS admin_users_role_check;

    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'admin_users'
          AND column_name = 'user_id'
    ) THEN
        RAISE EXCEPTION 'public.admin_users.user_id is missing; cannot safely map existing administrator records to auth.users.';
    END IF;
END
$$;

ALTER TABLE public.admin_users
    ALTER COLUMN role DROP DEFAULT;

UPDATE public.admin_users
SET created_at = now()
WHERE created_at IS NULL;

UPDATE public.admin_users
SET role = 'admin'
WHERE role IS NULL;

UPDATE public.admin_users
SET role = 'staff'
WHERE role NOT IN ('admin', 'manager', 'staff');

UPDATE public.admin_users
SET can_confirm_payments = (role IN ('admin', 'manager'))
WHERE can_confirm_payments IS NULL;

ALTER TABLE public.admin_users
    ALTER COLUMN role SET DEFAULT 'staff',
    ALTER COLUMN can_confirm_payments SET DEFAULT false,
    ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE public.admin_users
    ALTER COLUMN role SET NOT NULL,
    ALTER COLUMN can_confirm_payments SET NOT NULL,
    ALTER COLUMN created_at SET NOT NULL;

DO $$
DECLARE
    user_id_attnum SMALLINT;
BEGIN
    IF EXISTS (
        SELECT 1 FROM public.admin_users WHERE user_id IS NULL
    ) THEN
        RAISE EXCEPTION 'public.admin_users contains NULL user_id values; resolve these records before applying the authorization migration.';
    END IF;

    IF EXISTS (
        SELECT user_id
        FROM public.admin_users
        GROUP BY user_id
        HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION 'public.admin_users contains duplicate user_id values; resolve these records before applying the authorization migration.';
    END IF;

    ALTER TABLE public.admin_users ALTER COLUMN user_id SET NOT NULL;

    SELECT attnum INTO user_id_attnum
    FROM pg_attribute
    WHERE attrelid = 'public.admin_users'::regclass
      AND attname = 'user_id'
      AND NOT attisdropped;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'public.admin_users'::regclass
          AND contype IN ('p', 'u')
          AND conkey = ARRAY[user_id_attnum]::SMALLINT[]
    ) THEN
        ALTER TABLE public.admin_users
            ADD CONSTRAINT admin_users_user_id_key UNIQUE (user_id);
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_attribute a
          ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
        WHERE c.conrelid = 'public.admin_users'::regclass
          AND c.contype = 'f'
          AND c.confrelid = 'auth.users'::regclass
          AND a.attname = 'user_id'
    ) THEN
        ALTER TABLE public.admin_users
            ADD CONSTRAINT admin_users_user_id_auth_users_fkey
            FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
            NOT VALID;
    END IF;

    ALTER TABLE public.admin_users
        ADD CONSTRAINT admin_users_role_check CHECK (role IN ('admin', 'manager', 'staff'));
END
$$;

ALTER TABLE public.admin_users
    ALTER COLUMN role SET DEFAULT 'staff',
    ALTER COLUMN can_confirm_payments SET DEFAULT false,
    ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.admin_users FROM PUBLIC, anon, authenticated;
REVOKE INSERT (user_id, role, can_confirm_payments, created_at),
       UPDATE (user_id, role, can_confirm_payments, created_at),
       REFERENCES (user_id, role, can_confirm_payments, created_at)
    ON TABLE public.admin_users FROM PUBLIC, anon, authenticated;
GRANT SELECT (user_id, role, can_confirm_payments, created_at) ON TABLE public.admin_users TO authenticated;

DO $$
DECLARE
    existing_policy RECORD;
BEGIN
    -- RLS policies are permissive by default, so replace stale policies on these tables.
    FOR existing_policy IN
        SELECT policyname
        FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'admin_users'
    LOOP
        EXECUTE format('DROP POLICY %I ON public.admin_users', existing_policy.policyname);
    END LOOP;
END
$$;

CREATE POLICY "Users can view their own admin record"
    ON public.admin_users FOR SELECT TO authenticated
    USING (user_id = (SELECT auth.uid()));

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.admin_users AS au
        WHERE au.user_id = (SELECT auth.uid())
          AND au.role = 'admin'
    );
$$;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

CREATE OR REPLACE FUNCTION public.has_payment_confirmation_permission()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.admin_users AS au
        WHERE au.user_id = (SELECT auth.uid())
          AND (
              au.role IN ('admin', 'manager')
              OR au.can_confirm_payments = TRUE
          )
    );
$$;

REVOKE ALL ON FUNCTION public.has_payment_confirmation_permission() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_payment_confirmation_permission() TO authenticated;

ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS payment_status TEXT,
    ADD COLUMN IF NOT EXISTS payment_confirmed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS payment_confirmed_by UUID;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_attribute a
          ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
        WHERE c.conrelid = 'public.orders'::regclass
          AND c.contype = 'f'
          AND c.confrelid = 'auth.users'::regclass
          AND a.attname = 'payment_confirmed_by'
    ) THEN
        ALTER TABLE public.orders
            ADD CONSTRAINT orders_payment_confirmed_by_auth_users_fkey
            FOREIGN KEY (payment_confirmed_by) REFERENCES auth.users(id)
            NOT VALID;
    END IF;
END
$$;

ALTER TABLE public.orders
    ALTER COLUMN payment_status SET DEFAULT 'unpaid';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'orders_payment_status_check'
          AND conrelid = 'public.orders'::regclass
    ) THEN
        ALTER TABLE public.orders
            ADD CONSTRAINT orders_payment_status_check
            CHECK (payment_status IS NULL OR payment_status IN ('paid', 'unpaid', 'not_recorded'));
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'orders_payment_confirmation_check'
          AND conrelid = 'public.orders'::regclass
    ) THEN
        ALTER TABLE public.orders
            ADD CONSTRAINT orders_payment_confirmation_check
            CHECK (
                (payment_status = 'paid' AND payment_confirmed_at IS NOT NULL AND payment_confirmed_by IS NOT NULL)
                OR (payment_status IS DISTINCT FROM 'paid' AND payment_confirmed_at IS NULL AND payment_confirmed_by IS NULL)
            );
    END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.payment_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
    payment_method TEXT NOT NULL,
    previous_payment_status TEXT NOT NULL,
    new_payment_status TEXT NOT NULL CHECK (new_payment_status = 'paid'),
    amount NUMERIC(10, 2) NOT NULL CHECK (amount >= 0),
    confirmed_by UUID NOT NULL REFERENCES auth.users(id),
    confirmed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (previous_payment_status = 'unpaid')
);

CREATE INDEX IF NOT EXISTS idx_orders_payment_status_created_at
    ON public.orders(payment_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_history_order_confirmed
    ON public.payment_history(order_id, confirmed_at DESC);

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_history ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.orders FROM PUBLIC, anon, authenticated;
REVOKE UPDATE (payment_status, payment_confirmed_at, payment_confirmed_by)
    ON TABLE public.orders FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.service_requests FROM PUBLIC, anon, authenticated;
GRANT INSERT ON TABLE public.orders TO anon, authenticated;
GRANT SELECT, UPDATE (status) ON TABLE public.orders TO authenticated;
GRANT INSERT ON TABLE public.service_requests TO anon, authenticated;
GRANT SELECT, UPDATE ON TABLE public.service_requests TO authenticated;
REVOKE ALL ON TABLE public.payment_history FROM PUBLIC, anon, authenticated;
REVOKE INSERT (id, order_id, payment_method, previous_payment_status, new_payment_status, amount, confirmed_by, confirmed_at),
       UPDATE (id, order_id, payment_method, previous_payment_status, new_payment_status, amount, confirmed_by, confirmed_at),
       REFERENCES (id, order_id, payment_method, previous_payment_status, new_payment_status, amount, confirmed_by, confirmed_at)
    ON TABLE public.payment_history FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.payment_history TO authenticated;

DO $$
DECLARE
    existing_policy RECORD;
BEGIN
    FOR existing_policy IN
        SELECT schemaname, tablename, policyname
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename IN ('orders', 'service_requests', 'payment_history')
    LOOP
        EXECUTE format(
            'DROP POLICY %I ON %I.%I',
            existing_policy.policyname,
            existing_policy.schemaname,
            existing_policy.tablename
        );
    END LOOP;
END
$$;

CREATE POLICY "Authorized payment staff can read payment history"
    ON public.payment_history FOR SELECT TO authenticated
    USING ((SELECT public.has_payment_confirmation_permission()));

CREATE POLICY "Customers can create orders"
    ON public.orders FOR INSERT TO anon, authenticated
    WITH CHECK (
        status = 'received'
        AND NULLIF(btrim(order_number), '') IS NOT NULL
        AND NULLIF(btrim(table_number), '') IS NOT NULL
        AND jsonb_typeof(items) = 'array'
        AND subtotal >= 0
        AND tax >= 0
        AND total >= 0
        AND payment_method IN ('UPI Online', 'Pay at Counter', 'Pay After Eating')
        AND payment_status = 'unpaid'
        AND payment_confirmed_at IS NULL
        AND payment_confirmed_by IS NULL
    );

CREATE POLICY "Authorized payment staff can read orders"
    ON public.orders FOR SELECT TO authenticated
    USING (
        (SELECT public.is_admin())
        OR (SELECT public.has_payment_confirmation_permission())
    );

CREATE POLICY "Admins can update orders"
    ON public.orders FOR UPDATE TO authenticated
    USING ((SELECT public.is_admin()))
    WITH CHECK ((SELECT public.is_admin()));

CREATE POLICY "Customers can create service requests"
    ON public.service_requests FOR INSERT TO anon, authenticated
    WITH CHECK (
        status = 'pending'
        AND NULLIF(btrim(table_number), '') IS NOT NULL
        AND NULLIF(btrim(request_type), '') IS NOT NULL
    );

CREATE POLICY "Admins can read service requests"
    ON public.service_requests FOR SELECT TO authenticated
    USING ((SELECT public.is_admin()));

CREATE POLICY "Admins can update service requests"
    ON public.service_requests FOR UPDATE TO authenticated
    USING ((SELECT public.is_admin()))
    WITH CHECK ((SELECT public.is_admin()));

CREATE OR REPLACE FUNCTION public.confirm_order_payment(p_order_id UUID)
RETURNS public.payment_history
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    target_order public.orders%ROWTYPE;
    history_record public.payment_history%ROWTYPE;
    staff_user_id UUID := auth.uid();
BEGIN
    IF staff_user_id IS NULL OR NOT public.has_payment_confirmation_permission() THEN
        RAISE EXCEPTION 'You are not authorized to confirm payments.'
            USING ERRCODE = '42501';
    END IF;

    SELECT *
    INTO target_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order not found.'
            USING ERRCODE = 'P0002';
    END IF;

    IF target_order.payment_status IS DISTINCT FROM 'unpaid' THEN
        RAISE EXCEPTION 'Only unpaid orders can be confirmed.'
            USING ERRCODE = '22023';
    END IF;

    IF target_order.status = 'cancelled' OR target_order.total IS NULL OR target_order.total < 0 THEN
        RAISE EXCEPTION 'This order cannot be confirmed as paid.'
            USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.payment_history (
        order_id,
        payment_method,
        previous_payment_status,
        new_payment_status,
        amount,
        confirmed_by
    )
    VALUES (
        target_order.id,
        target_order.payment_method,
        'unpaid',
        'paid',
        target_order.total,
        staff_user_id
    )
    RETURNING * INTO history_record;

    UPDATE public.orders
    SET payment_status = 'paid',
        payment_confirmed_at = history_record.confirmed_at,
        payment_confirmed_by = staff_user_id
    WHERE id = target_order.id;

    RETURN history_record;
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_order_payment(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_order_payment(UUID) TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
