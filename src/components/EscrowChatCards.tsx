import { useEffect, useState } from "react";
import { supabase, formatNgn } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  FileText,
  Lock,
  CheckCircle2,
  Receipt,
  Shield,
  Clock,
  ArrowRight,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";

// -------- Card message encoding --------
// Cards are persisted inside message.body as a single line prefix so the
// existing messages table + realtime pipeline is untouched:
//   [[card:agreement]]{"agreement_id":"...", ...}
// A plain-text fallback (rendered on old clients) follows after \n\n.

export type CardKind = "agreement" | "payment" | "completion" | "deal_summary";

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
  if (kind === "agreement") {
    return (
      <AgreementCard payload={payload as AgreementCardPayload} meId={meId} onEdit={onEdit} />
    );
  }
  if (kind === "payment") return <PaymentCard payload={payload as PaymentCardPayload} />;
  if (kind === "completion") return <CompletionCard payload={payload as CompletionCardPayload} />;
  if (kind === "deal_summary") return <DealSummaryCard payload={payload as DealSummaryCardPayload} />;
  return null;
}

function CardShell({
  accent,
  children,
  align,
}: {
  accent: "primary" | "accent" | "coral" | "payment";
  children: React.ReactNode;
  align?: "start" | "end";
}) {
  const border =
    accent === "primary"
      ? "border-primary/20"
      : accent === "coral"
        ? "border-coral/30"
        : accent === "payment"
          ? "border-payment/25"
          : "border-accent/25";
  return (
    <div
      className={cn(
        "w-full max-w-[92%] sm:max-w-[420px] my-2",
        align === "end" ? "self-end ml-auto" : "self-start mr-auto",
      )}
    >
      <div
        className={cn(
          "rounded-2xl border bg-card shadow-[0_6px_20px_-12px_rgba(15,23,42,0.18)]",
          border,
        )}
      >
        {children}
      </div>
    </div>
  );
}

// ---- Agreement Card ----
function AgreementCard({
  payload,
  meId,
  onEdit,
}: {
  payload: AgreementCardPayload;
  meId: string;
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
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Escrow Agreement
                </span>
              </div>
              <div className="font-semibold text-[15px] text-foreground truncate mt-0.5">
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
              <div className="text-xl font-extrabold text-gradient-brand">
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
                className="bg-gradient-brand"
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

// ---- Payment Card ----
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
          <EscrowProgress stage="holding" />
        </div>
      </div>
    </CardShell>
  );
}

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
    <CardShell accent="accent">
      <div className="p-4 space-y-3">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-xl bg-payment/15 grid place-items-center shrink-0">
            <CheckCircle2 className="h-5 w-5 text-payment" strokeWidth={2.5} />
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
          <Row label="Amount released" value={formatNgn(payload.amount)} green />
          <Row
            label="EasyMeet Protection Fee"
            value={`− ${formatNgn(payload.protection_fee)}`}
            muted
          />
          <Row label="Professional received" value={formatNgn(payload.payout)} green bold />
        </div>
      </div>
    </CardShell>
  );
}

// ---- Deal Summary Card ----
function DealSummaryCard({ payload }: { payload: DealSummaryCardPayload }) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const completedAt = payload.completed_at
    ? new Date(payload.completed_at)
    : null;
  return (
    <>
      <CardShell accent="primary">
        <div className="p-4 space-y-3">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 grid place-items-center shrink-0">
              <Receipt className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Deal summary
              </div>
              <div className="font-semibold text-[15px] text-foreground truncate mt-0.5">
                {payload.title}
              </div>
              <div className="flex items-center gap-2 mt-1.5">
                <Badge variant="outline" className="text-[10px] capitalize">
                  {agreementTypeLabel(payload.agreement_type)}
                </Badge>
                <Badge variant="secondary" className="text-[10px] capitalize">
                  {payload.status}
                </Badge>
              </div>
            </div>
          </div>

          <div className="rounded-xl bg-muted/40 border border-border/60 divide-y divide-border/60">
            <Row label="Amount paid" value={formatNgn(payload.total)} />
            <Row
              label="🛡️ Protection Fee"
              value={formatNgn(payload.protection_fee)}
              muted
            />
            <Row label="💳 Paystack Fee" value={formatNgn(payload.paystack_fee)} muted />
            <Row
              label="✅ Professional received"
              value={formatNgn(payload.released)}
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
              <Row label="Amount customer paid" value={formatNgn(payload.total)} />
              <Row label="💳 Paystack Fee" value={formatNgn(payload.paystack_fee)} muted />
              <Row
                label="🛡️ EasyMeet Protection Fee"
                value={formatNgn(payload.protection_fee)}
                muted
              />
              <Row
                label="✅ Professional received"
                value={formatNgn(payload.released)}
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

function Row({
  label,
  value,
  muted,
  bold,
  accent,
  green,
}: {
  label: string;
  value: string;
  muted?: boolean;
  bold?: boolean;
  accent?: boolean;
  green?: boolean;
}) {
  return (
    <div className="flex justify-between items-center px-3 py-2 text-[13px]">
      <span className={muted ? "text-muted-foreground" : "text-foreground"}>{label}</span>
      <span
        className={cn(
          bold ? "font-bold" : "font-semibold",
          green ? "text-payment" : accent ? "text-accent" : "text-foreground",
          "capitalize",
        )}
      >
        {value}
      </span>
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
                  {type === "product_sale" ? (
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
                  <Row label="Total" value={formatNgn(price)} bold />
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
              ) : null}
            </>
          )}
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
