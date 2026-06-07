-- Shop: product_reviews table, products.avg_rating/review_count,
-- orders.commission_amount + auto-calc on product orders.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS avg_rating numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS review_count integer NOT NULL DEFAULT 0;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS commission_amount numeric NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.product_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  rating integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, customer_id)
);

GRANT SELECT ON public.product_reviews TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_reviews TO authenticated;
GRANT ALL ON public.product_reviews TO service_role;

ALTER TABLE public.product_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Product reviews: public read" ON public.product_reviews;
CREATE POLICY "Product reviews: public read"
  ON public.product_reviews FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Product reviews: customer insert after completed order" ON public.product_reviews;
CREATE POLICY "Product reviews: customer insert after completed order"
  ON public.product_reviews FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = customer_id
    AND EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.product_id = product_reviews.product_id
        AND o.customer_id = auth.uid()
        AND o.status = 'completed'
    )
  );

DROP POLICY IF EXISTS "Product reviews: customer update own" ON public.product_reviews;
CREATE POLICY "Product reviews: customer update own"
  ON public.product_reviews FOR UPDATE
  TO authenticated
  USING (auth.uid() = customer_id)
  WITH CHECK (auth.uid() = customer_id);

DROP POLICY IF EXISTS "Product reviews: customer delete own" ON public.product_reviews;
CREATE POLICY "Product reviews: customer delete own"
  ON public.product_reviews FOR DELETE
  TO authenticated
  USING (auth.uid() = customer_id);

CREATE OR REPLACE FUNCTION public.recompute_product_rating()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pid uuid;
BEGIN
  pid := COALESCE(NEW.product_id, OLD.product_id);
  UPDATE public.products p
  SET
    avg_rating = COALESCE((SELECT AVG(rating)::numeric(3,2) FROM public.product_reviews WHERE product_id = pid), 0),
    review_count = (SELECT COUNT(*) FROM public.product_reviews WHERE product_id = pid)
  WHERE p.id = pid;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_recompute_product_rating ON public.product_reviews;
CREATE TRIGGER trg_recompute_product_rating
AFTER INSERT OR UPDATE OR DELETE ON public.product_reviews
FOR EACH ROW EXECUTE FUNCTION public.recompute_product_rating();

CREATE OR REPLACE FUNCTION public.set_order_commission()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.kind = 'product' AND NEW.payment_status = 'paid' THEN
    NEW.commission_amount := ROUND((COALESCE(NEW.amount, 0) * 0.03)::numeric, 2);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_order_commission ON public.orders;
CREATE TRIGGER trg_set_order_commission
BEFORE INSERT OR UPDATE OF amount, payment_status, kind ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.set_order_commission();

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.product_reviews;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;
