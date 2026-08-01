import { useEffect, useState } from "react";
import { supabase, formatNgn } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  FileText,
  Lock,
  CheckCircle2,
  Shield,
  Clock,
  ArrowRight,
  Wallet,
  AlertTriangle,
  PartyPopper,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { computePaystackFee } from "@/lib/paystackFees";

// -------- Card message encoding --------
// Cards are persisted inside message.body as a single line prefix so the
// existing messages table + realtime pipeline is untouched:
//   [[card:agreement]]{"agreement_id":"...", ...}
// A plain-text fallback (rendered on old clients) follows after \n\n.

export type CardKind =
  | "agreement"
  | "payment"
  | "completion"
  | "deal_summary"
  | "agreement_received"
  | "agreement_accepted"
  | "escrow_funded"
  | "work_in_progress"
  | "job_completed"
  | "customer_decision"
  | "payment_released"
  | "dispute_opened"
  | "dispute_resolved";

type BaseCardPayload = Record<string, unknown>;

export interface AgreementCardPayload extends BaseCardPayload {
  agreement_id: string;
  title: string;
  agreement_type: string;
  amount: number;
  sender_id: string;
}
export interface PaymentCardPayload extends BaseCardPayload {
  escrow_id?: string;
  order_id?: string;
  amount: number;
  materials_released?: number;
  release_condition?: string;
}
export interface CompletionCardPayload extends BaseCardPayload {
  amount: number;
  protection_fee: number;
  paystack_fee?: number;
  payout: number;
  released_at: string;
}
export interface DealSummaryCardPayload extends BaseCardPayload {
  agreement_id?: string;
  order_id?: string;
  escrow_id?: string;
  title: string;
  agreement_type: string;
  total: number;
  protection_fee: number;
  paystack_fee: number;
  released: number;
  status: string;
  completed_at?: string;
}

export interface AgreementReceivedCardPayload extends BaseCardPayload {
  agreement_id: string;
  title: string;
  agreement_type: string;
  amount: number;
  sender_id: string;
}
export interface AgreementAcceptedCardPayload extends BaseCardPayload {
  agreement_id: string;
  title: string;
  agreement_type: string;
  amount: number;
  sender_id: string;
}
export interface EscrowFundedCardPayload extends BaseCardPayload {
  escrow_id: string;
  amount: number;
  title: string;
}
export interface WorkInProgressCardPayload extends BaseCardPayload {
  escrow_id: string;
  amount: number;
  title: string;
}
export interface JobCompletedCardPayload extends BaseCardPayload {
  escrow_id: string;
  amount: number;
  title: string;
}
export interface CustomerDecisionCardPayload extends BaseCardPayload {
  escrow_id: string;
  amount: number;
  title: string;
}
export interface PaymentReleasedCardPayload extends BaseCardPayload {
  escrow_id: string;
  amount: number;
  protection_fee: number;
  payout: number;
  title: string;
  released_at: string;
}
export interface DisputeOpenedCardPayload extends BaseCardPayload {
  escrow_id: string;
  amount: number;
  title: string;
  reason: string;
}
export interface DisputeResolvedCardPayload extends BaseCardPayload {
  escrow_id: string;
  amount: number;
  title: string;
  resolution: string;
  payout: number;
}

export function encodeCard(kind: CardKind, payload: BaseCardPayload, fallback: string): string {
  return `[[card:${kind}]]${JSON.stringify(payload)}\n\n${fallback}`;
}

const CARD_RE = /^\[\[card:([a-z_]+)\]\](\{[\s\S]*?\})(?:\n|$)/;

export function parseCardMessage(body: string): {
  kind: CardKind;
  payload: BaseCardPayload;
} | null {
  if (!body || !body.startsWith("[[card:")) return null;
  const m = body.match(CARD_RE);
  if (!m) return null;
  try {
    const payload = JSON.parse(m[2]) as BaseCardPayload;
    return { kind: m[1] as CardKind, payload };
  } catch {
    return null;
  }
}

const AGREEMENT_TYPE_LABELS: Record<string, string> = {
  service: "Service",
  product_sale: "Product Sale",
  material_labor: "Material + Labor",
  delivery: "Delivery",
};

function agreementTypeLabel(t: string): string {
  return AGREEMENT_TYPE_LABELS[t] ?? t.replace(/_/g, " ");
}

// -------- Cards --------

export function EscrowChatCard({
  kind,
  payload,
  meId,
  mine,
  onEdit,
}: {
  kind: CardKind;
  payload: BaseCardPayload;
  meId: string;
  mine: boolean;
  onEdit?: (agreementId: string) => void;
}) {
  switch (kind) {
    case "agreement":
      return (
        <AgreementCard
          payload={payload as AgreementCardPayload}
          meId={meId}
          mine={mine}
          onEdit={onEdit}
        />
      );
    case "agreement_received":
      return (
        <AgreementReceivedCard
          payload={payload as AgreementReceivedCardPayload}
          meId={meId}
          mine={mine}
        />
      );
    case "agreement_accepted":
      return (
        <AgreementAcceptedCard
          payload={payload as AgreementAcceptedCardPayload}
          meId={meId}
          mine={mine}
        />
      );
    case "escrow_funded":
      return <EscrowFundedCard payload={payload as EscrowFundedCardPayload} />;
    case "work_in_progress":
      return <WorkInProgressCard payload={payload as WorkInProgressCardPayload} />;
    case "job_completed":
      return <JobCompletedCard payload={payload as JobCompletedCardPayload} />;
    case "customer_decision":
      return <CustomerDecisionCard payload={payload as CustomerDecisionCardPayload} />;
    case "payment_released":
      return <PaymentReleasedCard payload={payload as PaymentReleasedCardPayload} />;
    case "dispute_opened":
      return <DisputeOpenedCard payload={payload as DisputeOpenedCardPayload} />;
    case "dispute_resolved":
      return <DisputeResolvedCard payload={payload as DisputeResolvedCardPayload} />;
    case "payment":
      return <PaymentCard payload={payload as PaymentCardPayload} />;
    case "completion":
      return <CompletionCard payload={payload as CompletionCardPayload} />;
    case "deal_summary":
      return <DealSummaryCard payload={payload as DealSummaryCardPayload} />;
    default:
      return null;
  }
}

// -------- CardShell --------

function CardShell({
  accent,
  children,
  align,
}: {
  accent: "primary" | "green" | "red" | "blue" | "yellow" | "payment";
  children: React.ReactNode;
  align?: "start" | "end";
}) {
  const border =
    accent === "primary"
      ? "border-primary/20"
      : accent === "green"
        ? "border-emerald-200 bg-emerald-50/30"
        : accent === "red"
          ? "border-red-200 bg-red-50/30"
          : accent === "blue"
            ? "border-blue-200 bg-blue-50/30"
            : accent === "yellow"
              ? "border-amber-200 bg-amber-50/30"
              : "border-payment/25";

  const accentBg =
    accent === "primary"
      ? ""
      : accent === "green"
        ? "bg-emerald-50/30"
        : accent === "red"
          ? "bg-red-50/30"
          : accent === "blue"
            ? "bg-blue-50/30"
            : accent === "yellow"
              ? "bg-amber-50/30"
              : "";

  return (
    <div
      className={cn(
        "w-full max-w-[85%] my-2",
        align === "end" ? "self-end ml-auto" : "self-start mr-auto",
      )}
    >
      <div
        className={cn(
          "rounded-2xl border bg-card shadow-[0_2px_8px_rgba(0,0,0,0.06)]",
          border,
          accentBg,
        )}
      >
        {children}
      </div>
    </div>
  );
}

// -------- Row helper --------

function Row({
  label,
  value,
  muted,
  bold,
  green,
}: {
  label: string;
  value: string;
  muted?: boolean;
  bold?: boolean;
  green?: boolean;
}) {
  return (
    <div className="flex justify-between items-center px-3 py-2 text-[13px]">
      <span className={muted ? "text-muted-foreground" : "text-foreground"}>{label}</span>
      <span
        className={cn(
          bold ? "font-bold" : "font-semibold",
          green ? "text-emerald-600" : "text-foreground",
        )}
      >
        {value}
      </span>
    </div>
  );
}

// -------- EscrowProgress --------

function EscrowProgress({ currentStep }: { currentStep: number }) {
  const steps = ["Agreement", "Paid", "In Progress", "Completed", "Released"];
  return (
    <div className="flex items-center gap-1 pt-1">
      {steps.map((s, i) => {
        const stepNum = i + 1;
        const isActive = stepNum <= currentStep;
        const isCurrent = stepNum === currentStep;
        return (
          <div key={s} className="flex-1 flex flex-col items-center gap-1">
            <div className="relative w-full flex items-center">
              <div
                className={cn(
                  "h-1.5 rounded-full w-full",
                  isActive ? "bg-emerald-500" : "bg-gray-200",
                )}
              />
              {isCurrent && (
                <div className="absolute left-1/2 -translate-x-1/2 -top-[1px]">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse border-2 border-white" />
                </div>
              )}
            </div>
            <span className="text-[9px] text-muted-foreground leading-none whitespace-nowrap">
              {s}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ---- Agreement Card (Stage 1 - Sent) ----
function AgreementCard({
  payload,
  meId,
  mine,
  onEdit,
}: {
  payload: AgreementCardPayload;
  meId: string;
  mine: boolean;
  onEdit?: (agreementId: string) => void;
}) {
  const [status, setStatus] = useState<string | null>(null);
  const [viewOpen, setViewOpen] = useState(false);

  useEffect(() => {
    let cancel = false;
    (async () => {
      const { data } = await supabase
        .from("service_agreements")
        .select("status")
        .eq("id", payload.agreement_id)
        .maybeSingle();
      if (!cancel && data) setStatus((data as { status: string }).status);
    })();
    return () => {
      cancel = true;
    };
  }, [payload.agreement_id]);

  const canEdit = (status ?? "pending") === "pending" && payload.sender_id === meId;
  const statusStyle =
    status === "accepted"
      ? "bg-accent/15 text-accent border-accent/30"
      : status === "rejected" || status === "cancelled"
        ? "bg-destructive/10 text-destructive border-destructive/30"
        : "bg-primary/10 text-primary border-primary/30";

  return (
    <>
      <CardShell accent="primary">
        <div className="p-4 space-y-3">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 grid place-items-center shrink-0">
              <FileText className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Agreement Sent
              </div>
              <div className="text-[11px] text-muted-foreground mt-0.5">
                Waiting for customer response
              </div>
              <div className="font-semibold text-[15px] text-foreground truncate mt-1">
                {payload.title}
              </div>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <Badge variant="outline" className="text-[10px] capitalize">
                  {agreementTypeLabel(payload.agreement_type)}
                </Badge>
                <span
                  className={cn(
                    "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold capitalize",
                    statusStyle,
                  )}
                >
                  {status ?? "pending"}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-end justify-between pt-1">
            <div>
              <div className="text-[11px] text-muted-foreground">Total amount</div>
              <div className="text-xl font-extrabold text-foreground">
                {formatNgn(payload.amount)}
              </div>
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <Button
              size="sm"
              variant="secondary"
              className="flex-1"
              onClick={() => setViewOpen(true)}
            >
              View Agreement
            </Button>
            {canEdit && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  if (onEdit) return onEdit(payload.agreement_id);
                  if (typeof window !== "undefined") {
                    window.dispatchEvent(
                      new CustomEvent("escrow:edit-agreement", {
                        detail: { agreement_id: payload.agreement_id },
                      }),
                    );
                  }
                }}
              >
                Edit
              </Button>
            )}
          </div>
        </div>
      </CardShell>
      <ViewAgreementModal
        open={viewOpen}
        onOpenChange={setViewOpen}
        agreementId={payload.agreement_id}
      />
    </>
  );
}

// ---- Agreement Received Card (Stage 2) ----
function AgreementReceivedCard({
  payload,
  meId,
  mine,
}: {
  payload: AgreementReceivedCardPayload;
  meId: string;
  mine: boolean;
}) {
  const [status, setStatus] = useState<string | null>(null);
  const [viewOpen, setViewOpen] = useState(false);

  useEffect(() => {
    let cancel = false;
    (async () => {
      const { data } = await supabase
        .from("service_agreements")
        .select("status")
        .eq("id", payload.agreement_id)
        .maybeSingle();
      if (!cancel && data) setStatus((data as { status: string }).status);
    })();
    return () => {
      cancel = true;
    };
  }, [payload.agreement_id]);

  const statusStyle =
    status === "accepted"
      ? "bg-accent/15 text-accent border-accent/30"
      : status === "rejected" || status === "cancelled"
        ? "bg-destructive/10 text-destructive border-destructive/30"
        : "bg-primary/10 text-primary border-primary/30";

  return (
    <>
      <CardShell accent="blue">
        <div className="p-4 space-y-3">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-xl bg-blue-100 grid place-items-center shrink-0">
              <FileText className="h-5 w-5 text-blue-600" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Agreement Received
              </div>
              <div className="text-[11px] text-muted-foreground mt-0.5">
                Review and respond to continue
              </div>
              <div className="font-semibold text-[15px] text-foreground truncate mt-1">
                {payload.title}
              </div>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <Badge variant="outline" className="text-[10px] capitalize">
                  {agreementTypeLabel(payload.agreement_type)}
                </Badge>
                <span
                  className={cn(
                    "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold capitalize",
                    statusStyle,
                  )}
                >
                  {status ?? "pending"}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-end justify-between pt-1">
            <div>
              <div className="text-[11px] text-muted-foreground">Total amount</div>
              <div className="text-xl font-extrabold text-foreground">
                {formatNgn(payload.amount)}
              </div>
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <Button
              size="sm"
              variant="secondary"
              className="flex-1"
              onClick={() => setViewOpen(true)}
            >
              View Agreement
            </Button>
            <Button size="sm" className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white">
              Accept
            </Button>
            <Button size="sm" variant="outline" className="flex-1">
              Request Changes
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="flex-1 border-red-300 text-red-600 hover:bg-red-50"
            >
              Reject
            </Button>
          </div>
        </div>
      </CardShell>
      <ViewAgreementModal
        open={viewOpen}
        onOpenChange={setViewOpen}
        agreementId={payload.agreement_id}
      />
    </>
  );
}

// ---- Agreement Accepted Card (Stage 3) ----
function AgreementAcceptedCard({
  payload,
  meId,
  mine,
}: {
  payload: AgreementAcceptedCardPayload;
  meId: string;
  mine: boolean;
}) {
  return (
    <>
    <CardShell accent="green">
      <div className="p-4 space-y-3">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-xl bg-emerald-100 grid place-items-center shrink-0">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Agreement Accepted
            </div>
            <div className="font-semibold text-[15px] text-foreground truncate mt-1">
              {payload.title}
            </div>
            <div className="flex items-center gap-2 mt-1.5">
              <Badge variant="outline" className="text-[10px] capitalize">
                {agreementTypeLabel(payload.agreement_type)}
              </Badge>
            </div>
          </div>
        </div>

        <div className="flex items-end justify-between pt-1">
          <div>
            <div className="text-[11px] text-muted-foreground">Total amount</div>
            <div className="text-xl font-extrabold text-foreground">
              {formatNgn(payload.amount)}
            </div>
          </div>
        </div>

        <EscrowProgress currentStep={1} />

        <Button size="sm" className="w-full bg-emerald-500 hover:bg-emerald-600 text-white">
          Pay into Escrow
        </Button>
      </div>
    </CardShell>
  );
}

// ---- Escrow Funded Card (Stage 4) ----
function EscrowFundedCard({ payload }: { payload: EscrowFundedCardPayload }) {
  return (
    <CardShell accent="green">
      <div className="p-4 space-y-3">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-xl bg-emerald-100 grid place-items-center shrink-0">
            <Lock className="h-5 w-5 text-emerald-600" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Funds in Escrow
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              Payment secured by EasyMeet
            </div>
            <div className="font-semibold text-[15px] text-foreground truncate mt-1">
              {payload.title}
            </div>
          </div>
        </div>

        <div className="pt-1">
          <div className="text-xl font-extrabold text-emerald-600">{formatNgn(payload.amount)}</div>
          <div className="text-[11px] text-muted-foreground font-mono mt-0.5">
            Escrow {payload.escrow_id?.slice(0, 8)}...
          </div>
        </div>

        <EscrowProgress currentStep={2} />
      </div>
    </CardShell>
  );
}

// ---- Work in Progress Card (Stage 5) ----
function WorkInProgressCard({ payload }: { payload: WorkInProgressCardPayload }) {
  return (
    <CardShell accent="yellow">
      <div className="p-4 space-y-3">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-xl bg-amber-100 grid place-items-center shrink-0">
            <Clock className="h-5 w-5 text-amber-600" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Work in Progress
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              Professional is working on your job
            </div>
            <div className="font-semibold text-[15px] text-foreground truncate mt-1">
              {payload.title}
            </div>
          </div>
        </div>

        <div className="pt-1">
          <div className="text-xl font-extrabold text-foreground">{formatNgn(payload.amount)}</div>
          <div className="text-[11px] text-muted-foreground font-mono mt-0.5">
            Escrow {payload.escrow_id?.slice(0, 8)}...
          </div>
        </div>

        <EscrowProgress currentStep={3} />

        <Button size="sm" variant="outline" className="w-full">
          Review Work
        </Button>
      </div>
    </CardShell>
  );
}

// ---- Job Completed Card (Stage 6) ----
function JobCompletedCard({ payload }: { payload: JobCompletedCardPayload }) {
  return (
    <CardShell accent="green">
      <div className="p-4 space-y-3">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-xl bg-emerald-100 grid place-items-center shrink-0">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Job Completed
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">Please review the work</div>
            <div className="font-semibold text-[15px] text-foreground truncate mt-1">
              {payload.title}
            </div>
          </div>
        </div>

        <div className="pt-1">
          <div className="text-xl font-extrabold text-foreground">{formatNgn(payload.amount)}</div>
          <div className="text-[11px] text-muted-foreground font-mono mt-0.5">
            Escrow {payload.escrow_id?.slice(0, 8)}...
          </div>
        </div>

        <EscrowProgress currentStep={4} />

        <Button size="sm" className="w-full bg-emerald-500 hover:bg-emerald-600 text-white">
          Review Work
        </Button>
      </div>
    </CardShell>
  );
}

// ---- Customer Decision Card (Stage 7) ----
function CustomerDecisionCard({ payload }: { payload: CustomerDecisionCardPayload }) {
  return (
    <CardShell accent="yellow">
      <div className="p-4 space-y-3">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-xl bg-amber-100 grid place-items-center shrink-0">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Action Required
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              Review the work and take action
            </div>
            <div className="font-semibold text-[15px] text-foreground truncate mt-1">
              {payload.title}
            </div>
          </div>
        </div>

        <div className="pt-1">
          <div className="text-xl font-extrabold text-foreground">{formatNgn(payload.amount)}</div>
          <div className="text-[11px] text-muted-foreground font-mono mt-0.5">
            Escrow {payload.escrow_id?.slice(0, 8)}...
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          <Button size="sm" className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white">
            Release Payment
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="flex-1 border-red-300 text-red-600 hover:bg-red-50"
          >
            Report Issue
          </Button>
          <Button size="sm" variant="outline" className="flex-1">
            Request Changes
          </Button>
        </div>
      </div>
    </CardShell>
  );
}

// ---- Payment Released Card (Stage 8) ----
function PaymentReleasedCard({ payload }: { payload: PaymentReleasedCardPayload }) {
  return (
    <CardShell accent="green">
      <div className="p-4 space-y-3">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-xl bg-emerald-100 grid place-items-center shrink-0">
            <PartyPopper className="h-5 w-5 text-emerald-600" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Payment Released
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              Deal completed successfully
            </div>
            <div className="font-semibold text-[15px] text-foreground truncate mt-1">
              {payload.title}
            </div>
          </div>
        </div>

        <div className="text-[11px] text-muted-foreground font-mono">
          Escrow {payload.escrow_id?.slice(0, 8)}...
        </div>

        <div className="rounded-xl bg-muted/40 border border-border/60 divide-y divide-border/60">
          <Row label="Customer paid" value={formatNgn(payload.amount)} bold />
          <Row
            label="EasyMeet Protection Fee"
            value={`− ${formatNgn(payload.protection_fee)}`}
            muted
          />
          <Row label="Professional received" value={formatNgn(payload.payout)} green bold />
        </div>

        <Button size="sm" className="w-full bg-primary text-primary-foreground hover:bg-primary/90">
          Leave a Review
        </Button>
      </div>
    </CardShell>
  );
}

// ---- Dispute Opened Card (Stage 9A) ----
function DisputeOpenedCard({ payload }: { payload: DisputeOpenedCardPayload }) {
  return (
    <CardShell accent="red">
      <div className="p-4 space-y-3">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-xl bg-red-100 grid place-items-center shrink-0">
            <AlertTriangle className="h-5 w-5 text-red-600" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Dispute Opened
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              Our team will investigate
            </div>
            <div className="font-semibold text-[15px] text-foreground truncate mt-1">
              {payload.title}
            </div>
          </div>
        </div>

        <div className="text-[11px] text-muted-foreground font-mono">
          Escrow {payload.escrow_id?.slice(0, 8)}...
        </div>

        <div className="rounded-xl bg-red-50/50 border border-red-100 p-3">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-red-600 mb-1">
            What happens next
          </div>
          <p className="text-[13px] text-foreground/80 leading-snug">
            Our dispute resolution team will review the evidence from both parties and reach a fair
            resolution within 3-5 business days. Funds remain securely held in escrow during the
            investigation.
          </p>
        </div>

        <Button size="sm" variant="outline" className="w-full">
          View Dispute
        </Button>
      </div>
    </CardShell>
  );
}

// ---- Dispute Resolved Card (Stage 9B) ----
function DisputeResolvedCard({ payload }: { payload: DisputeResolvedCardPayload }) {
  return (
    <CardShell accent="green">
      <div className="p-4 space-y-3">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-xl bg-emerald-100 grid place-items-center shrink-0">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Dispute Resolved
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              {payload.resolution === "resolved_release"
                ? "Payment released to professional"
                : "Payment refunded to customer"}
            </div>
            <div className="font-semibold text-[15px] text-foreground truncate mt-1">
              {payload.title}
            </div>
          </div>
        </div>

        <div className="rounded-xl bg-muted/40 border border-border/60 divide-y divide-border/60">
          <Row label="Dispute amount" value={formatNgn(payload.amount)} bold />
          <Row label="Resolution" value={payload.resolution?.replace(/_/g, " ") ?? "Resolved"} />
          {payload.resolution === "resolved_release" && (
            <Row label="Professional received" value={formatNgn(payload.payout)} green bold />
          )}
        </div>

        <Button size="sm" className="w-full bg-primary text-primary-foreground hover:bg-primary/90">
          Leave a Review
        </Button>
      </div>
    </CardShell>
  );
}

// ---- Payment Card (legacy) ----
function PaymentCard({ payload }: { payload: PaymentCardPayload }) {
  return (
    <CardShell accent="payment">
      <div className="p-4 space-y-3">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-xl bg-payment/15 grid place-items-center shrink-0">
            <Lock className="h-5 w-5 text-payment" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Payment received
            </div>
            <div className="font-bold text-lg text-foreground truncate mt-0.5">
              {formatNgn(payload.amount)}
            </div>
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5">
              <Shield className="h-3 w-3 text-payment" />
              Funds held securely in escrow
            </p>
          </div>
        </div>

        {payload.materials_released && payload.materials_released > 0 ? (
          <div className="text-[12px] rounded-lg bg-payment/5 border border-payment/15 px-3 py-2 text-payment">
            {formatNgn(payload.materials_released)} for materials released immediately.
          </div>
        ) : null}

        <div className="rounded-xl bg-muted/40 border border-border/60 p-3 space-y-2">
          <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            Release condition
          </div>
          <p className="text-[13px] text-foreground leading-snug">
            {payload.release_condition ??
              "Funds are released to the professional when the customer marks the job as complete."}
          </p>
          <EscrowProgress currentStep={2} />
        </div>
      </div>
    </CardShell>
  );
}

// ---- Completion Card (legacy) ----
function EscrowProgress({ stage }: { stage: "holding" | "completed" }) {
  const steps = ["Negotiate", "Agreement", "Payment", "Complete"];
  // Payment held = stage 3 (3/4 fills). Completed = stage 4 (4/4 fills).
  const activeIdx = stage === "completed" ? 3 : 2;
  return (
    <div className="pt-2">
      <div className="flex items-center gap-1.5">
        {steps.map((s, i) => (
          <div
            key={s}
            className={cn(
              "h-2 rounded-full flex-1 transition-all duration-500 ease-out",
              i <= activeIdx
                ? "bg-gradient-to-r from-emerald-500 to-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.4)]"
                : "bg-border/60",
            )}
          />
        ))}
      </div>
      <div className="mt-1.5 flex items-center gap-1.5">
        {steps.map((s, i) => (
          <div
            key={s}
            className={cn(
              "flex-1 text-center text-[9px] font-semibold uppercase tracking-wide transition-colors",
              i <= activeIdx ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground/60",
            )}
          >
            {s}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---- Completion Card ----
function CompletionCard({ payload }: { payload: CompletionCardPayload }) {
  return (
    <CardShell accent="green">
      <div className="p-4 space-y-3">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-xl bg-emerald-100 grid place-items-center shrink-0">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" strokeWidth={2.5} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Deal completed
            </div>
            <div className="font-bold text-[15px] text-foreground mt-0.5">
              Payment released to professional
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              {new Date(payload.released_at).toLocaleString(undefined, {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </div>
          </div>
        </div>

        <div className="rounded-xl bg-muted/40 border border-border/60 divide-y divide-border/60">
          <Row label="Amount customer paid" value={formatNgn(payload.amount)} />
          <Row
            label="🛡️ EasyMeet Protection Fee"
            value={formatNgn(payload.protection_fee)}
            muted
          />
          {typeof payload.paystack_fee === "number" && payload.paystack_fee > 0 && (
            <Row
              label="💳 Paystack Fee"
              value={formatNgn(payload.paystack_fee)}
              muted
            />
          )}
          <Row label="✅ Professional received" value={formatNgn(payload.payout)} green bold />
        </div>
      </div>
    </CardShell>
  );
}

// ---- Deal Summary Card ----
function DealSummaryCard({ payload }: { payload: DealSummaryCardPayload }) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [escrow, setEscrow] = useState<{
    amount: number;
    commission_amount: number;
    paystack_fee: number | null;
    payout_amount: number;
    released_at: string | null;
  } | null>(null);

  // Prefer the live escrow row; fall back to the persisted card payload.
  useEffect(() => {
    if (!payload.escrow_id) return;
    let cancel = false;
    (async () => {
      const { data, error } = await supabase
        .from("escrow")
        .select("amount, commission_amount, paystack_fee, payout_amount, released_at")
        .eq("id", payload.escrow_id)
        .maybeSingle();
      if (cancel) return;
      if (error) {
        console.warn("Deal summary could not read escrow row; using payload", error);
        return;
      }
      if (!data) return;
      setEscrow({
        amount: Number(data.amount ?? 0),
        commission_amount: Number(data.commission_amount ?? 0),
        paystack_fee: data.paystack_fee != null ? Number(data.paystack_fee) : null,
        payout_amount: Number(data.payout_amount ?? 0),
        released_at: (data.released_at as string | null) ?? null,
      });
    })();
    return () => {
      cancel = true;
    };
  }, [payload.escrow_id]);

  const completedAtFromPayload = payload.completed_at
    ? new Date(payload.completed_at)
    : null;
  const serviceAmount = Number(escrow?.amount ?? payload.total ?? 0);
  const protectionFee = Number(escrow?.commission_amount ?? payload.protection_fee ?? 0);
  const rawPaystackFee = escrow?.paystack_fee ?? payload.paystack_fee;
  const isService = payload.agreement_type === "service";
  const paystackFee = isService
    ? computePaystackFee(serviceAmount)
    : rawPaystackFee != null && !Number.isNaN(Number(rawPaystackFee))
      ? Number(rawPaystackFee)
      : computePaystackFee(serviceAmount + protectionFee);
  // Service Agreement fee tiers (₦5,000 threshold on the Service Fee):
  //  - Above ₦5,000: customer pays Service Fee + Protection Fee (no Paystack row).
  //                  Professional receives Service Fee − Paystack Fee.
  //  - ≤ ₦5,000: Protection Fee = 0. Customer pays Service Fee + Paystack Fee.
  //              Professional receives full Service Fee.
  const isServiceHighTier = isService && serviceAmount > 5000;
  const isServiceLowTier = isService && serviceAmount <= 5000;
  const totalCustomerPaid = isServiceHighTier
    ? serviceAmount + protectionFee
    : isServiceLowTier
      ? serviceAmount + paystackFee
      : serviceAmount + protectionFee + paystackFee;
  const professionalReceived = isServiceHighTier
    ? Math.max(0, serviceAmount - paystackFee)
    : isServiceLowTier
      ? serviceAmount
      : Number(escrow?.payout_amount ?? payload.released ?? 0);
  const completedAt = escrow?.released_at
    ? new Date(escrow.released_at)
    : completedAtFromPayload;

  return (
    <CardShell accent="green">
      <div className="p-4 space-y-3">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-xl bg-emerald-100 grid place-items-center shrink-0">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Deal Completed
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              Payment released to professional
            </div>
            <div className="font-semibold text-[15px] text-foreground truncate mt-1">
              {payload.title}
            </div>
            <div className="flex items-center gap-2 mt-1.5">
              <Badge variant="outline" className="text-[10px] capitalize">
                {agreementTypeLabel(payload.agreement_type)}
              </Badge>
              <span className="inline-flex items-center rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200 px-2 py-0.5 text-[10px] font-semibold capitalize">
                Completed
              </span>
            </div>
          </div>
        </div>

        <div className="rounded-xl bg-gray-50 border border-border/60 divide-y divide-border/60">
          <Row label={payload.title} value={formatNgn(payload.total)} bold />
          <Row label="Customer paid" value={formatNgn(payload.total + payload.paystack_fee)} />
          <Row
            label="EasyMeet Protection Fee"
            value={`− ${formatNgn(payload.protection_fee)}`}
            muted
          />
          <Row label="Professional received" value={formatNgn(payload.released)} green bold />
          <Row
            label="Completed on"
            value={new Date().toLocaleString(undefined, {
              dateStyle: "medium",
              timeStyle: "short",
            })}
            muted
          />
          <div className="rounded-xl bg-muted/40 border border-border/60 divide-y divide-border/60">
            <Row
              label="Amount customer paid"
              value={formatNgn(totalCustomerPaid)}
            />
            {!isService && (
              <Row
                label="💳 Paystack Fee"
                value={formatNgn(paystackFee)}
                muted
              />
            )}
            <Row
              label="🛡️ EasyMeet Protection Fee"
              value={formatNgn(isServiceLowTier ? 0 : protectionFee)}
              muted
            />
            <Row
              label="✅ Professional received"
              value={formatNgn(professionalReceived)}
              green
              bold
            />
            {completedAt && (
              <Row
                label="📅 Completed"
                value={completedAt.toLocaleString(undefined, {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
                muted
              />
            )}
            <Row label="Status" value={payload.status} />
          </div>

          <Button
            size="sm"
            variant="secondary"
            className="w-full"
            onClick={() => setDetailsOpen(true)}
          >
            View Full Details <ArrowRight className="h-3.5 w-3.5 ml-1" />
          </Button>
        </div>

        <div className="flex justify-end pt-1">
          <button className="text-[13px] font-semibold text-primary hover:underline">
            View Full Deal Details ›
          </button>
        </div>
      </div>
    </CardShell>
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="sm:max-w-lg rounded-3xl overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wallet className="h-5 w-5 text-primary" /> Transaction details
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <div className="text-xs text-muted-foreground">Agreement</div>
              <div className="font-semibold">{payload.title}</div>
              <div className="text-xs text-muted-foreground capitalize mt-0.5">
                {agreementTypeLabel(payload.agreement_type)}
              </div>
            </div>
            <div className="rounded-xl bg-muted/40 border border-border/60 divide-y divide-border/60">
              <Row
                label="Amount customer paid"
                value={formatNgn(totalCustomerPaid)}
              />
              {!isService && (
                <Row
                  label="💳 Paystack Fee"
                  value={formatNgn(paystackFee)}
                  muted
                />
              )}
              <Row
                label="🛡️ EasyMeet Protection Fee"
                value={formatNgn(isServiceLowTier ? 0 : protectionFee)}
                muted
              />
              <Row
                label="✅ Professional received"
                value={formatNgn(professionalReceived)}
                green
                bold
              />
              {completedAt && (
                <Row
                  label="📅 Completed"
                  value={completedAt.toLocaleString(undefined, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                  muted
                />
              )}
              <Row label="Status" value={payload.status} />
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// -------- StatusLegend --------

export function StatusLegend() {
  const items = [
    { color: "bg-emerald-500", label: "Secure & Protected" },
    { color: "bg-amber-500", label: "Waiting" },
    { color: "bg-orange-500", label: "Action Required" },
    { color: "bg-emerald-500", label: "Completed" },
    { color: "bg-red-500", label: "Issue/Dispute" },
  ];
  return (
    <div className="flex flex-wrap gap-3 py-2 px-1">
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-1.5">
          <div className={cn("w-1.5 h-1.5 rounded-full shrink-0", item.color)} />
          <span className="text-[10px] text-muted-foreground">{item.label}</span>
        </div>
      ))}
    </div>
  );
}

// -------- View Agreement full-screen modal --------

function ViewAgreementModal({
  open,
  onOpenChange,
  agreementId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  agreementId: string;
}) {
  const [loading, setLoading] = useState(true);
  const [agreement, setAgreement] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    (async () => {
      const { data } = await supabase
        .from("service_agreements")
        .select("*")
        .eq("id", agreementId)
        .maybeSingle();
      setAgreement((data as Record<string, unknown> | null) ?? null);
      setLoading(false);
    })();
  }, [open, agreementId]);

  const a = agreement ?? {};
  const type = (a.agreement_type as string) ?? "service";
  const price = Number(a.price ?? a.total_amount ?? 0);
  const termsText = (a.terms as string) ?? "";
  const pickupMatch = termsText.match(/Pickup:\s*(.+)/);
  const dropoffMatch = termsText.match(/Drop-off:\s*(.+)/);
  const pickup = pickupMatch ? pickupMatch[1].trim() : "";
  const dropoff = dropoffMatch ? dropoffMatch[1].trim() : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl sm:rounded-[28px] rounded-[24px] overflow-hidden max-h-[92vh] overflow-y-auto p-0">
        <div className="rounded-2xl border border-primary/20 bg-card shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
          <div className="bg-gradient-brand text-primary-foreground px-6 py-6">
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-widest opacity-90">
              <Shield className="h-3.5 w-3.5" /> Escrow Agreement
            </div>
            <h2 className="text-xl font-extrabold mt-2 leading-tight">
              {(a.job_title as string) ?? "Agreement"}
            </h2>
            <div className="flex items-center gap-2 mt-3">
              <span className="rounded-full bg-white/15 backdrop-blur px-2.5 py-1 text-[11px] font-semibold capitalize">
                {agreementTypeLabel(type)}
              </span>
              <span className="rounded-full bg-white/15 backdrop-blur px-2.5 py-1 text-[11px] font-semibold capitalize">
                {(a.status as string) ?? "pending"}
              </span>
            </div>
          </div>
          <div className="p-6 space-y-4">
            {loading ? (
              <div className="text-sm text-muted-foreground">Loading…</div>
            ) : (
              <>
                {a.job_description ? (
                  <Section title="Description">
                    <p className="text-sm text-foreground/90 whitespace-pre-wrap">
                      {a.job_description as string}
                    </p>
                  </Section>
                ) : null}

                <Section title="Amounts">
                  <div className="rounded-xl bg-muted/40 border border-border/60 divide-y divide-border/60">
                    {Number(a.materials_cost ?? 0) > 0 && (
                      <Row
                        label="Materials (released immediately)"
                        value={formatNgn(Number(a.materials_cost))}
                      />
                    )}
                    {Number(a.labor_cost ?? 0) > 0 && (
                      <Row label="Labor / Service fee" value={formatNgn(Number(a.labor_cost))} />
                    )}
                    {Number(a.contingency_cost ?? 0) > 0 && (
                      <Row
                        label="Contingency"
                        value={formatNgn(Number(a.contingency_cost))}
                        muted
                      />
                    )}
                    <Row label="Total" value={formatNgn(price)} bold />
                  </div>
        </div>
        <div className="p-6 space-y-4">
          {loading ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : (
            <>
              {a.job_description ? (
                <Section title="Description">
                  <p className="text-sm text-foreground/90 whitespace-pre-wrap">
                    {a.job_description as string}
                  </p>
                </Section>
              ) : null}

              <Section title="Amounts">
                <div className="rounded-xl bg-muted/40 border border-border/60 divide-y divide-border/60">
                  {type === "service" ? (
                    (() => {
                      const laborCost = Number(a.labor_cost ?? 0);
                      const rawCommission = Number(a.commission_amount ?? 0);
                      const rawPaystack = Number(a.paystack_fee ?? 0);
                      const highTier = laborCost > 5000;
                      const commission = highTier ? rawCommission : 0;
                      const paystackFee = highTier
                        ? computePaystackFee(laborCost)
                        : rawPaystack || computePaystackFee(laborCost);
                      const totalYouPay = highTier
                        ? laborCost + commission
                        : laborCost + paystackFee;
                      const professionalReceives = highTier
                        ? Math.max(0, laborCost - paystackFee)
                        : laborCost;
                      return (
                        <>
                          <Row label="Service Fee" value={formatNgn(laborCost)} />
                          {highTier ? (
                            <Row
                              label="EasyMeet Protection Fee"
                              value={formatNgn(commission)}
                              muted
                            />
                          ) : (
                            <Row
                              label="Paystack Processing Fee"
                              value={formatNgn(paystackFee)}
                              muted
                            />
                          )}
                          <div className="px-3 py-2">
                            <div className="h-px bg-border/60" />
                          </div>
                          <Row label="Total You'll Pay" value={formatNgn(totalYouPay)} bold />
                          <Row
                            label="Professional Receives"
                            value={formatNgn(professionalReceives)}
                            green
                            bold
                          />
                        </>
                      );
                    })()
                  ) : type === "product_sale" ? (
                    <>
                      {Number(a.labor_cost ?? 0) > 0 && (
                        <Row
                          label="Product Price — Held in escrow until delivery confirmed"
                          value={formatNgn(Number(a.labor_cost))}
                        />
                      )}
                      {Number(a.materials_cost ?? 0) > 0 && (
                        <Row
                          label="Delivery Fee — Released immediately"
                          value={formatNgn(Number(a.materials_cost))}
                        />
                      )}
                    </>
                  ) : type === "delivery" ? (
                    <>
                      {Number(a.labor_cost ?? 0) > 0 && (
                        <Row
                          label="Delivery Fee — Goes to rider in full"
                          value={formatNgn(Number(a.labor_cost))}
                        />
                      )}
                    </>
                  ) : (
                    <>
                      {Number(a.materials_cost ?? 0) > 0 && (
                        <Row
                          label="Materials (released immediately)"
                          value={formatNgn(Number(a.materials_cost))}
                        />
                      )}
                      {Number(a.labor_cost ?? 0) > 0 && (
                        <Row label="Labor / Service fee" value={formatNgn(Number(a.labor_cost))} />
                      )}
                    </>
                  )}
                  {type !== "service" && <Row label="Total" value={formatNgn(price)} bold />}
                </div>
              </Section>

              {type === "delivery" && (pickup || dropoff) ? (
                <Section title="Delivery route">
                  <div className="rounded-xl bg-muted/40 border border-border/60 divide-y divide-border/60">
                    {pickup && <Row label="📍 Pickup" value={pickup} />}
                    {dropoff && <Row label="📍 Delivery to" value={dropoff} />}
                  </div>
                </Section>
              ) : null}

              {a.terms ? (
                <Section title="Terms">
                  <p className="text-sm text-foreground/90 whitespace-pre-wrap">
                    {a.terms as string}
                  </p>
                </Section>
              ) : null}

              {a.delivery_date ? (
                <Section title="Delivery / Completion date">
                  <p className="text-sm text-foreground/90">
                    {new Date(a.delivery_date as string).toLocaleDateString(undefined, {
                      dateStyle: "long",
                    })}
                  </p>
                </Section>

                {a.terms ? (
                  <Section title="Terms">
                    <p className="text-sm text-foreground/90 whitespace-pre-wrap">
                      {a.terms as string}
                    </p>
                  </Section>
                ) : null}

                {a.delivery_date ? (
                  <Section title="Delivery / Completion date">
                    <p className="text-sm text-foreground/90">
                      {new Date(a.delivery_date as string).toLocaleDateString(undefined, {
                        dateStyle: "long",
                      })}
                    </p>
                  </Section>
                ) : null}
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
        {title}
      </div>
      {children}
    </div>
  );
}
