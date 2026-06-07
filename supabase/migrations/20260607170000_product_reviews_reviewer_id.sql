-- Product reviews: use reviewer_id, prevent duplicate product reviews per customer,
-- and keep product rating aggregates updated automatically.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'product_reviews' AND column_name = 'customer_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'product_reviews' AND column_name = 'reviewer_id'
  ) THEN
    ALTER TABLE public.product_reviews RENAME COLUMN customer_id TO reviewer_id;
  ELSIF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'product_reviews' AND column_name = 'reviewer_id'
  ) THEN
    ALTER TABLE public.product_reviews ADD COLUMN reviewer_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'product_reviews' AND column_name = 'customer_id'
  ) THEN
    EXECUTE 'UPDATE public.product_reviews SET reviewer_id = customer_id WHERE reviewer_id IS NULL';
  END IF;
END $$;

DROP POLICY IF EXISTS "Product reviews: customer insert after completed order" ON public.product_reviews;
DROP POLICY IF EXISTS "Product reviews: reviewer insert after completed order" ON public.product_reviews;
DROP POLICY IF EXISTS "Product reviews: customer update own" ON public.product_reviews;
DROP POLICY IF EXISTS "Product reviews: reviewer update own" ON public.product_reviews;
DROP POLICY IF EXISTS "Product reviews: customer delete own" ON public.product_reviews;
DROP POLICY IF EXISTS "Product reviews: reviewer delete own" ON public.product_reviews;

ALTER TABLE public.product_reviews
  ALTER COLUMN reviewer_id SET NOT NULL;

ALTER TABLE public.product_reviews
  DROP CONSTRAINT IF EXISTS product_reviews_product_id_customer_id_key,
  DROP CONSTRAINT IF EXISTS product_reviews_product_id_reviewer_id_key;

ALTER TABLE public.product_reviews
  DROP COLUMN IF EXISTS customer_id;

ALTER TABLE public.product_reviews
  ADD CONSTRAINT product_reviews_product_id_reviewer_id_key UNIQUE (product_id, reviewer_id);

CREATE POLICY "Product reviews: reviewer insert after completed order"
  ON public.product_reviews FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = reviewer_id
    AND EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = product_reviews.order_id
        AND o.product_id = product_reviews.product_id
        AND o.customer_id = auth.uid()
        AND o.status = 'completed'
    )
  );

CREATE POLICY "Product reviews: reviewer update own"
  ON public.product_reviews FOR UPDATE
  TO authenticated
  USING (auth.uid() = reviewer_id)
  WITH CHECK (auth.uid() = reviewer_id);

CREATE POLICY "Product reviews: reviewer delete own"
  ON public.product_reviews FOR DELETE
  TO authenticated
  USING (auth.uid() = reviewer_id);

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
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_recompute_product_rating ON public.product_reviews;
CREATE TRIGGER trg_recompute_product_rating
AFTER INSERT OR UPDATE OR DELETE ON public.product_reviews
FOR EACH ROW EXECUTE FUNCTION public.recompute_product_rating();
