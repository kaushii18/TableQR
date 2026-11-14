-- Payment state is independent of order workflow state. Existing orders remain
-- NULL (Not Recorded) until staff verify a payment.

ALTER TABLE public.admin_users
    ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'admin',
    ADD COLUMN IF NOT EXISTS can_confirm_payments BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.admin_users
    ALTER COLUMN role SET DEFAULT 'staff';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'admin_users_role_check'
          AND conrelid = 'public.admin_users'::regclass
    ) THEN
        ALTER TABLE public.admin_users
            ADD CONSTRAINT admin_users_role_check CHECK (role IN ('admin', 'manager', 'staff'));
    END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.admin_users
        WHERE user_id = (SELECT auth.uid())
          AND role = 'admin'
    );
$$;

ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS payment_status TEXT,
    ADD COLUMN IF NOT EXISTS payment_confirmed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS payment_confirmed_by UUID REFERENCES auth.users(id);

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
                OR (payment_status IS DISTINCT FROM 'paid'
                    AND payment_confirmed_at IS NULL
                    AND payment_confirmed_by IS NULL)
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

CREATE OR REPLACE FUNCTION public.has_payment_confirmation_permission()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.admin_users
        WHERE user_id = (SELECT auth.uid())
          AND (role IN ('admin', 'manager') OR can_confirm_payments)
    );
$$;

REVOKE ALL ON FUNCTION public.has_payment_confirmation_permission() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_payment_confirmation_permission() TO authenticated;

DROP POLICY IF EXISTS "Admins can read orders" ON public.orders;
CREATE POLICY "Authorized payment staff can read orders"
    ON public.orders FOR SELECT TO authenticated
    USING (
        (SELECT public.is_admin())
        OR (SELECT public.has_payment_confirmation_permission())
    );

DROP POLICY IF EXISTS "Customers can create orders" ON public.orders;
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

REVOKE UPDATE ON public.orders FROM authenticated;
GRANT UPDATE (status) ON public.orders TO authenticated;

ALTER TABLE public.payment_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.payment_history FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.payment_history TO authenticated;

DROP POLICY IF EXISTS "Authorized payment staff can read payment history" ON public.payment_history;
CREATE POLICY "Authorized payment staff can read payment history"
    ON public.payment_history FOR SELECT TO authenticated
    USING ((SELECT public.has_payment_confirmation_permission()));

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
    IF staff_user_id IS NULL
       OR NOT public.has_payment_confirmation_permission() THEN
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
