-- Create the missing orders table that the app references everywhere.
-- The application code (shop, my-orders, escrow flow) expects this table to exist
-- but it was never created in the live database.

CREATE TABLE IF NOT EXISTS public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id uuid,
  service_id uuid,
  service_title text NOT NULL,
  amount numeric NOT NULL CHECK (amount >= 0),
  currency text NOT NULL DEFAULT 'NGN',
  kind text NOT NULL DEFAULT 'service' CHECK (kind IN ('service','product')),
  payment_ref text,
  payment_status text NOT NULL DEFAULT 'pending',
  status text NOT NULL DEFAULT 'pending',
  escrow_status text,
  escrow_stage text,
  commission_amount numeric NOT NULL DEFAULT 0,
  payout_amount numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_orders_customer ON public.orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_provider ON public.orders(provider_id);
CREATE INDEX IF NOT EXISTS idx_orders_product ON public.orders(product_id);
CREATE INDEX IF NOT EXISTS idx_orders_created ON public.orders(created_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.orders TO authenticated;
GRANT ALL ON public.orders TO service_role;

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "orders parties read" ON public.orders;
CREATE POLICY "orders parties read" ON public.orders
  FOR SELECT TO authenticated
  USING (customer_id = auth.uid() OR provider_id = auth.uid());

DROP POLICY IF EXISTS "orders customer insert" ON public.orders;
CREATE POLICY "orders customer insert" ON public.orders
  FOR INSERT TO authenticated
  WITH CHECK (customer_id = auth.uid());

DROP POLICY IF EXISTS "orders parties update" ON public.orders;
CREATE POLICY "orders parties update" ON public.orders
  FOR UPDATE TO authenticated
  USING (customer_id = auth.uid() OR provider_id = auth.uid())
  WITH CHECK (customer_id = auth.uid() OR provider_id = auth.uid());

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_orders_updated_at ON public.orders;
CREATE TRIGGER trg_orders_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.orders REPLICA IDENTITY FULL;
DO $$ BEGIN
  PERFORM 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='orders';
  IF NOT FOUND THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
  END IF;
END $$;