-- ==============================================================================
-- STAR PLANET FAMILY RESTAURANT & BAR
-- SUPABASE DATABASE SCHEMA FOR TABLE QR ORDERING SYSTEM
-- ==============================================================================

-- 1. Create orders table
CREATE TABLE IF NOT EXISTS public.orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number TEXT NOT NULL,
    table_number TEXT NOT NULL,
    customer_name TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    items JSONB NOT NULL,
    instructions TEXT,
    subtotal NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    tax NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    total NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    payment_method TEXT NOT NULL DEFAULT 'UPI',
    status TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'preparing', 'served', 'completed', 'cancelled')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for speedy querying by table & created_at
CREATE INDEX IF NOT EXISTS idx_orders_table ON public.orders(table_number);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders(created_at DESC);

-- 2. Create service requests / waiter calls table
CREATE TABLE IF NOT EXISTS public.service_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    table_number TEXT NOT NULL,
    request_type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'attended')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_service_table ON public.service_requests(table_number);
CREATE INDEX IF NOT EXISTS idx_service_status ON public.service_requests(status);

-- 3. Enable Row Level Security (RLS)
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_requests ENABLE ROW LEVEL SECURITY;

-- 4. Create RLS Policies allowing public anon access for demo / table QR
-- Customers can insert new orders
CREATE POLICY "Allow public insert on orders"
    ON public.orders FOR INSERT
    WITH CHECK (true);

-- Customers and kitchen screens can select orders
CREATE POLICY "Allow public read on orders"
    ON public.orders FOR SELECT
    USING (true);

-- Staff can update order status
CREATE POLICY "Allow public update on orders"
    ON public.orders FOR UPDATE
    USING (true)
    WITH CHECK (true);

-- Policies for service requests
CREATE POLICY "Allow public insert on service_requests"
    ON public.service_requests FOR INSERT
    WITH CHECK (true);

CREATE POLICY "Allow public read on service_requests"
    ON public.service_requests FOR SELECT
    USING (true);

CREATE POLICY "Allow public update on service_requests"
    ON public.service_requests FOR UPDATE
    USING (true)
    WITH CHECK (true);

-- 5. Enable Supabase Realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.service_requests;
