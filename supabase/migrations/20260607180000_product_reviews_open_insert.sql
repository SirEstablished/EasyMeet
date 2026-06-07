-- Allow any authenticated user to leave one review per product.
-- Previous policy required a completed order, which blocked all reviews
-- because orders are inserted with status 'confirmed'.

DROP POLICY IF EXISTS "Product reviews: customer insert after completed order" ON public.product_reviews;
DROP POLICY IF EXISTS "Product reviews: reviewer insert after completed order" ON public.product_reviews;
DROP POLICY IF EXISTS "Product reviews: reviewer insert" ON public.product_reviews;

-- order_id is optional now
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='product_reviews'
      AND column_name='order_id' AND is_nullable='NO'
  ) THEN
    ALTER TABLE public.product_reviews ALTER COLUMN order_id DROP NOT NULL;
  END IF;
END $$;

CREATE POLICY "Product reviews: reviewer insert"
  ON public.product_reviews FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = reviewer_id);

-- Ensure SELECT is open to authenticated users
DROP POLICY IF EXISTS "Product reviews: anyone read" ON public.product_reviews;
DROP POLICY IF EXISTS "Product reviews: authenticated read" ON public.product_reviews;
CREATE POLICY "Product reviews: authenticated read"
  ON public.product_reviews FOR SELECT
  TO authenticated
  USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_reviews TO authenticated;
GRANT ALL ON public.product_reviews TO service_role;
