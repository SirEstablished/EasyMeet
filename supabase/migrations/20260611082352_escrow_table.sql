-- Create the current escrow table linked to orders.
ALTER TABLE IF EXISTS public.escrow_disputes
  DROP CONSTRAINT IF EXISTS escrow_disputes_order_id_fkey;

CREATE TABLE IF NOT EXISTS public.escrow (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('service','product')),
  customer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  professional_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id uuid,
  agreement_id uuid REFERENCES public.service_agreements(id) ON DELETE SET NULL,
  product_id uuid,
  quantity integer DEFAULT 1,
  title text NOT NULL,
  amount_ngn numeric NOT NULL CHECK (amount_ngn > 0),
  commission_amount numeric NOT NULL DEFAULT 0,
  payout_amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending_payment'
    CHECK (status IN ('pending_payment','holding','in_progress','completed','disputed','refunded','cancelled')),
  payment_ref text,
  paystack_reference text,
  paid_at timestamptz,
  released_at timestamptz,
  refunded_at timestamptz,
  refund_status text CHECK (refund_status IN ('processing','succeeded','failed')),
  refund_amount numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_escrow_customer ON public.escrow(customer_id);
CREATE INDEX IF NOT EXISTS idx_escrow_pro ON public.escrow(professional_id);
CREATE INDEX IF NOT EXISTS idx_escrow_convo ON public.escrow(conversation_id);
CREATE INDEX IF NOT EXISTS idx_escrow_order ON public.escrow(order_id);

GRANT SELECT, INSERT, UPDATE ON public.escrow TO authenticated;
GRANT ALL ON public.escrow TO service_role;
ALTER TABLE public.escrow ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "escrow parties read" ON public.escrow;
CREATE POLICY "escrow parties read" ON public.escrow
  FOR SELECT TO authenticated
  USING (customer_id = auth.uid() OR professional_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
DROP POLICY IF EXISTS "escrow customer insert" ON public.escrow;
CREATE POLICY "escrow customer insert" ON public.escrow
  FOR INSERT TO authenticated WITH CHECK (customer_id = auth.uid());
DROP POLICY IF EXISTS "escrow parties update" ON public.escrow;
CREATE POLICY "escrow parties update" ON public.escrow
  FOR UPDATE TO authenticated
  USING (customer_id = auth.uid() OR professional_id = auth.uid() OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (customer_id = auth.uid() OR professional_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.escrow_disputes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL,
  opened_by uuid NOT NULL REFERENCES auth.users(id),
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved_release','resolved_refund')),
  resolution_note text,
  resolved_by uuid REFERENCES auth.users(id),
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.escrow_disputes TO authenticated;
GRANT ALL ON public.escrow_disputes TO service_role;
ALTER TABLE public.escrow_disputes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.escrow_disputes
  DROP CONSTRAINT IF EXISTS escrow_disputes_order_id_fkey;
ALTER TABLE public.escrow_disputes
  ADD CONSTRAINT escrow_disputes_order_id_fkey
  FOREIGN KEY (order_id) REFERENCES public.escrow(id) ON DELETE CASCADE;

DROP POLICY IF EXISTS "dispute parties read" ON public.escrow_disputes;
CREATE POLICY "dispute parties read" ON public.escrow_disputes
  FOR SELECT TO authenticated USING (
    public.has_role(auth.uid(),'admin')
    OR EXISTS (SELECT 1 FROM public.escrow o
               WHERE o.id = order_id AND (o.customer_id = auth.uid() OR o.professional_id = auth.uid()))
  );
DROP POLICY IF EXISTS "dispute parties insert" ON public.escrow_disputes;
CREATE POLICY "dispute parties insert" ON public.escrow_disputes
  FOR INSERT TO authenticated WITH CHECK (
    opened_by = auth.uid()
    AND EXISTS (SELECT 1 FROM public.escrow o
                WHERE o.id = order_id AND (o.customer_id = auth.uid() OR o.professional_id = auth.uid()))
  );
DROP POLICY IF EXISTS "dispute admin update" ON public.escrow_disputes;
CREATE POLICY "dispute admin update" ON public.escrow_disputes
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.escrow_dispute_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_id uuid NOT NULL REFERENCES public.escrow_disputes(id) ON DELETE CASCADE,
  uploaded_by uuid NOT NULL REFERENCES auth.users(id),
  note text,
  file_url text,
  is_chat_snapshot boolean NOT NULL DEFAULT false,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.escrow_dispute_evidence TO authenticated;
GRANT ALL ON public.escrow_dispute_evidence TO service_role;
ALTER TABLE public.escrow_dispute_evidence ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "evidence parties read" ON public.escrow_dispute_evidence;
CREATE POLICY "evidence parties read" ON public.escrow_dispute_evidence
  FOR SELECT TO authenticated USING (
    public.has_role(auth.uid(),'admin')
    OR EXISTS (
      SELECT 1 FROM public.escrow_disputes d
      JOIN public.escrow o ON o.id = d.order_id
      WHERE d.id = dispute_id AND (o.customer_id = auth.uid() OR o.professional_id = auth.uid())
    )
  );
DROP POLICY IF EXISTS "evidence parties insert" ON public.escrow_dispute_evidence;
CREATE POLICY "evidence parties insert" ON public.escrow_dispute_evidence
  FOR INSERT TO authenticated WITH CHECK (
    uploaded_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.escrow_disputes d
      JOIN public.escrow o ON o.id = d.order_id
      WHERE d.id = dispute_id AND (o.customer_id = auth.uid() OR o.professional_id = auth.uid())
    )
  );
