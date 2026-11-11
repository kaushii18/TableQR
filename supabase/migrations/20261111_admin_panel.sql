-- TableQR admin panel schema and access controls.
-- Review this migration and apply it manually only after approval.

CREATE TABLE IF NOT EXISTS public.admin_users (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

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
    );
$$;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.admin_users TO authenticated;

DROP POLICY IF EXISTS "Allow public insert on orders" ON public.orders;
DROP POLICY IF EXISTS "Allow public read on orders" ON public.orders;
DROP POLICY IF EXISTS "Allow public update on orders" ON public.orders;
DROP POLICY IF EXISTS "Allow public insert on service_requests" ON public.service_requests;
DROP POLICY IF EXISTS "Allow public read on service_requests" ON public.service_requests;
DROP POLICY IF EXISTS "Allow public update on service_requests" ON public.service_requests;

CREATE POLICY "Admins can view own admin role"
    ON public.admin_users FOR SELECT TO authenticated
    USING (user_id = (SELECT auth.uid()));

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
    );

CREATE POLICY "Admins can read orders"
    ON public.orders FOR SELECT TO authenticated
    USING ((SELECT public.is_admin()));

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

GRANT INSERT ON public.orders TO anon, authenticated;
GRANT SELECT, UPDATE ON public.orders TO authenticated;
GRANT INSERT ON public.service_requests TO anon, authenticated;
GRANT SELECT, UPDATE ON public.service_requests TO authenticated;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        RAISE EXCEPTION 'Supabase Realtime publication "supabase_realtime" does not exist.';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'orders'
    ) THEN
        EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.orders';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'service_requests'
    ) THEN
        EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.service_requests';
    END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.menu_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    icon TEXT NOT NULL DEFAULT '🍽️',
    description TEXT NOT NULL DEFAULT '',
    display_order INTEGER NOT NULL DEFAULT 0 CHECK (display_order >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.menu_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    legacy_id INTEGER UNIQUE,
    name TEXT NOT NULL,
    category_id UUID NOT NULL REFERENCES public.menu_categories(id) ON DELETE RESTRICT,
    price NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
    description TEXT NOT NULL DEFAULT '',
    type TEXT NOT NULL DEFAULT 'Veg',
    image TEXT NOT NULL DEFAULT '',
    is_available BOOLEAN NOT NULL DEFAULT true,
    is_popular BOOLEAN NOT NULL DEFAULT false,
    is_chef_special BOOLEAN NOT NULL DEFAULT false,
    display_order INTEGER NOT NULL DEFAULT 0 CHECK (display_order >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.menu_settings (
    singleton BOOLEAN PRIMARY KEY DEFAULT true CHECK (singleton),
    is_published BOOLEAN NOT NULL DEFAULT false
);

INSERT INTO public.menu_settings (singleton, is_published)
VALUES (true, false)
ON CONFLICT (singleton) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_menu_items_category_order
    ON public.menu_items(category_id, display_order, name);

CREATE TABLE IF NOT EXISTS public.restaurant_tables (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    table_number TEXT NOT NULL UNIQUE,
    capacity INTEGER NOT NULL DEFAULT 2 CHECK (capacity > 0),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.menu_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_tables ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view menu categories"
    ON public.menu_categories FOR SELECT TO anon, authenticated
    USING (true);

CREATE POLICY "Admins can manage menu categories"
    ON public.menu_categories FOR ALL TO authenticated
    USING ((SELECT public.is_admin()))
    WITH CHECK ((SELECT public.is_admin()));

CREATE POLICY "Anyone can view available menu items"
    ON public.menu_items FOR SELECT TO anon, authenticated
    USING (is_available = true);

CREATE POLICY "Admins can manage menu items"
    ON public.menu_items FOR ALL TO authenticated
    USING ((SELECT public.is_admin()))
    WITH CHECK ((SELECT public.is_admin()));

CREATE POLICY "Anyone can view menu publication state"
    ON public.menu_settings FOR SELECT TO anon, authenticated
    USING (true);

CREATE POLICY "Admins can update menu publication state"
    ON public.menu_settings FOR UPDATE TO authenticated
    USING ((SELECT public.is_admin()))
    WITH CHECK ((SELECT public.is_admin()));

CREATE POLICY "Admins can manage restaurant tables"
    ON public.restaurant_tables FOR ALL TO authenticated
    USING ((SELECT public.is_admin()))
    WITH CHECK ((SELECT public.is_admin()));

GRANT SELECT ON public.menu_categories, public.menu_items TO anon, authenticated;
GRANT SELECT ON public.menu_settings TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.menu_categories, public.menu_items, public.restaurant_tables TO authenticated;
GRANT UPDATE ON public.menu_settings TO authenticated;
GRANT SELECT ON public.restaurant_tables TO authenticated;
