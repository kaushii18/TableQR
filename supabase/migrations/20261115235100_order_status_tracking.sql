BEGIN;

ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS tracking_token UUID;

UPDATE public.orders
SET tracking_token = gen_random_uuid()
WHERE tracking_token IS NULL;

ALTER TABLE public.orders
    ALTER COLUMN tracking_token SET DEFAULT gen_random_uuid(),
    ALTER COLUMN tracking_token SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS orders_tracking_token_uidx
    ON public.orders (tracking_token);

DO $$
DECLARE
    status_attnum SMALLINT;
    status_constraint RECORD;
BEGIN
    IF EXISTS (
        SELECT 1
        FROM public.orders
        WHERE status IS NULL
           OR status NOT IN ('received', 'preparing', 'ready', 'served', 'completed', 'cancelled')
    ) THEN
        RAISE EXCEPTION 'public.orders contains a status outside the supported order lifecycle; resolve those rows before applying this migration.';
    END IF;

    SELECT attnum INTO status_attnum
    FROM pg_attribute
    WHERE attrelid = 'public.orders'::regclass
      AND attname = 'status'
      AND NOT attisdropped;

    FOR status_constraint IN
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = 'public.orders'::regclass
          AND contype = 'c'
          AND conkey = ARRAY[status_attnum]::SMALLINT[]
    LOOP
        EXECUTE format(
            'ALTER TABLE public.orders DROP CONSTRAINT %I',
            status_constraint.conname
        );
    END LOOP;

    ALTER TABLE public.orders
        ADD CONSTRAINT orders_status_check
        CHECK (status IN ('received', 'preparing', 'ready', 'served', 'completed', 'cancelled'));
END
$$;

REVOKE SELECT ON TABLE public.orders FROM PUBLIC, anon;

DO $$
DECLARE
    order_column RECORD;
BEGIN
    FOR order_column IN
        SELECT attname
        FROM pg_attribute
        WHERE attrelid = 'public.orders'::regclass
          AND attnum > 0
          AND NOT attisdropped
    LOOP
        EXECUTE format(
            'REVOKE SELECT (%I) ON TABLE public.orders FROM PUBLIC, anon',
            order_column.attname
        );
    END LOOP;
END
$$;

CREATE OR REPLACE FUNCTION public.get_customer_order_tracking_status(p_tracking_token UUID)
RETURNS TABLE (status TEXT)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT o.status
    FROM public.orders AS o
    WHERE o.tracking_token = p_tracking_token
    LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_customer_order_tracking_status(UUID)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_customer_order_tracking_status(UUID)
    TO anon, authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
