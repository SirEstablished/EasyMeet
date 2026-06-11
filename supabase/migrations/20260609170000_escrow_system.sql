-- Escrow, agreements, disputes
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_roles self read" ON public.user_roles;
CREATE POLICY "user_roles self read" ON public.user_roles
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE TABLE IF NOT EXISTS public.service_agreements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL,
  professional_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  price_ngn numeric NOT NULL CHECK (price_ngn > 0),
  terms text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected','cancelled')),
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_agreements_convo ON public.service_agreements(conversation_id);
GRANT SELECT, INSERT, UPDATE ON public.service_agreements TO authenticated;
GRANT ALL ON public.service_agreements TO service_role;
ALTER TABLE public.service_agreements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "agreements parties read" ON public.service_agreements;
CREATE POLICY "agreements parties read" ON public.service_agreements
  FOR SELECT TO authenticated
  USING (professional_id = auth.uid() OR customer_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
DROP POLICY IF EXISTS "agreements professional insert" ON public.service_agreements;
CREATE POLICY "agreements professional insert" ON public.service_agreements
  FOR INSERT TO authenticated
  WITH CHECK (professional_id = auth.uid());
DROP POLICY IF EXISTS "agreements parties update" ON public.service_agreements;
CREATE POLICY "agreements parties update" ON public.service_agreements
  FOR UPDATE TO authenticated
  USING (professional_id = auth.uid() OR customer_id = auth.uid())
  WITH CHECK (professional_id = auth.uid() OR customer_id = auth.uid());

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
  FOR INSERT TO authenticated
  WITH CHECK (customer_id = auth.uid());
DROP POLICY IF EXISTS "escrow parties update" ON public.escrow;
CREATE POLICY "escrow parties update" ON public.escrow
  FOR UPDATE TO authenticated
  USING (customer_id = auth.uid() OR professional_id = auth.uid() OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (customer_id = auth.uid() OR professional_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.escrow_disputes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.escrow(id) ON DELETE CASCADE,
  opened_by uuid NOT NULL REFERENCES auth.users(id),
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved_release','resolved_refund')),
  resolution_note text,
  resolved_by uuid REFERENCES auth.users(id),
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dispute_order ON public.escrow_disputes(order_id);
GRANT SELECT, INSERT, UPDATE ON public.escrow_disputes TO authenticated;
GRANT ALL ON public.escrow_disputes TO service_role;
ALTER TABLE public.escrow_disputes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "dispute parties read" ON public.escrow_disputes;
CREATE POLICY "dispute parties read" ON public.escrow_disputes
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'admin')
    OR EXISTS (SELECT 1 FROM public.escrow o
               WHERE o.id = order_id AND (o.customer_id = auth.uid() OR o.professional_id = auth.uid()))
  );
DROP POLICY IF EXISTS "dispute parties insert" ON public.escrow_disputes;
CREATE POLICY "dispute parties insert" ON public.escrow_disputes
  FOR INSERT TO authenticated
  WITH CHECK (
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
CREATE INDEX IF NOT EXISTS idx_evidence_dispute ON public.escrow_dispute_evidence(dispute_id);
GRANT SELECT, INSERT ON public.escrow_dispute_evidence TO authenticated;
GRANT ALL ON public.escrow_dispute_evidence TO service_role;
ALTER TABLE public.escrow_dispute_evidence ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "evidence parties read" ON public.escrow_dispute_evidence;
CREATE POLICY "evidence parties read" ON public.escrow_dispute_evidence
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'admin')
    OR EXISTS (
      SELECT 1 FROM public.escrow_disputes d
      JOIN public.escrow o ON o.id = d.order_id
      WHERE d.id = dispute_id AND (o.customer_id = auth.uid() OR o.professional_id = auth.uid())
    )
  );
DROP POLICY IF EXISTS "evidence parties insert" ON public.escrow_dispute_evidence;
CREATE POLICY "evidence parties insert" ON public.escrow_dispute_evidence
  FOR INSERT TO authenticated
  WITH CHECK (
    uploaded_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.escrow_disputes d
      JOIN public.escrow o ON o.id = d.order_id
      WHERE d.id = dispute_id AND (o.customer_id = auth.uid() OR o.professional_id = auth.uid())
    )
  );
