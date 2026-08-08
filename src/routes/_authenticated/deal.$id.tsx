import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase, formatNgn, type Profile } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { VerificationTicks } from "@/components/VerificationTicks";
import {
  ArrowLeft,
  Shield,
  CheckCircle2,
  Clock,
  Copy,
  MessageCircle,
  ExternalLink,
  AlertTriangle,
  Calendar,
  Wallet,
  User,
  FileText,
  HelpCircle,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/deal/$id")({
  component: DealDetailsPage,
});

interface EscrowRow {
  id: string;
  conversation_id: string | null;
  agreement_id: string | null;
  customer_id: string;
  professional_id: string;
  title: string | null;
  amount_ngn: number;
  commission_amount: number;
  payout_amount: number;
  status: string;
  stage: string | null;
  payment_ref: string | null;
  paid_at: string | null;
  released_at: string | null;
  created_at: string;
  kind: string | null;
  materials_amount?: number | null;
  labor_amount?: number | null;
}

interface AgreementRow {
  id: string;
  job_title: string;
  job_description: string | null;
  agreement_type: string;
  price: number;
  labor_cost: number | null;
  materials_cost: number | null;
  total_amount: number | null;
  commission_amount: number | null;
  paystack_fee: number | null;
  sender_id: string;
  receiver_id: string;
  status: string;
  terms: string | null;
}

const TIMELINE_STEPS = [
  { key: "payment_received", label: "Payment received from customer" },
  { key: "in_escrow", label: "Funds held in escrow" },
  { key: "complete_job", label: "Customer marks job as complete" },
  { key: "payment_released", label: "Payment released to professional" },
];

function getTimelineStatus(
  escrow: EscrowRow,
): Record<string, "completed" | "in_progress" | "pending"> {
  const s = escrow.status;
  if (s === "released" || s === "completed") {
    return {
      payment_received: "completed",
      in_escrow: "completed",
      complete_job: "completed",
      payment_released: "completed",
    };
  }
  if (s === "cancelled" || s === "refunded") {
    return {
      payment_received: "completed",
      in_escrow: "completed",
      complete_job: "pending",
      payment_released: "pending",
    };
  }
  if (s === "disputed") {
    return {
      payment_received: "completed",
      in_escrow: "completed",
      complete_job: "pending",
      payment_released: "pending",
    };
  }
  // holding / in_progress
  return {
    payment_received: "completed",
    in_escrow: "in_progress",
    complete_job: "pending",
    payment_released: "pending",
  };
}

function getProgressStep(status: string): number {
  if (status === "released" || status === "completed") return 4;
  if (status === "holding" || status === "in_progress") return 2;
  if (status === "disputed") return 2;
  return 1;
}

function DealDetailsPage() {
  const { id } = Route.useParams();
  const router = useRouter();
  const [escrow, setEscrow] = useState<EscrowRow | null>(null);
  const [agreement, setAgreement] = useState<AgreementRow | null>(null);
  const [customer, setCustomer] = useState<Profile | null>(null);
  const [professional, setProfessional] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: escrowData } = await supabase
        .from("escrow")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (cancelled || !escrowData) {
        setLoading(false);
        return;
      }
      const e = escrowData as unknown as EscrowRow;
      setEscrow(e);

      const [custData, profData] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", e.customer_id).maybeSingle(),
        supabase.from("profiles").select("*").eq("id", e.professional_id).maybeSingle(),
      ]);
      if (!cancelled) {
        setCustomer((custData.data as Profile) ?? null);
        setProfessional((profData.data as Profile) ?? null);
      }

      if (e.agreement_id) {
        const { data: agData } = await supabase
          .from("service_agreements")
          .select("*")
          .eq("id", e.agreement_id)
          .maybeSingle();
        if (!cancelled) setAgreement((agData as AgreementRow) ?? null);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const copyEscrowId = () => {
    if (!escrow) return;
    navigator.clipboard.writeText(escrow.id);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="max-w-lg mx-auto p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-32 bg-muted rounded" />
          <div className="h-40 bg-muted rounded-2xl" />
          <div className="h-32 bg-muted rounded-2xl" />
        </div>
      </div>
    );
  }

  if (!escrow) {
    return (
      <div className="max-w-lg mx-auto p-6 text-center">
        <p className="text-muted-foreground">Deal not found.</p>
        <Button variant="ghost" className="mt-4" onClick={() => router.back()}>
          Go back
        </Button>
      </div>
    );
  }

  const timeline = getTimelineStatus(escrow);
  const currentStep = getProgressStep(escrow.status);
  const protectionFee = Number(escrow.commission_amount ?? 0);
  const paidOn = escrow.paid_at
    ? new Date(escrow.paid_at).toLocaleDateString("en-NG", {
        dateStyle: "medium",
      })
    : "—";
  const paidTime = escrow.paid_at
    ? new Date(escrow.paid_at).toLocaleTimeString("en-NG", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";
  const completedDate = escrow.released_at
    ? new Date(escrow.released_at).toLocaleString("en-NG", {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : null;

  return (
    <div className="max-w-lg mx-auto px-4 py-4 pb-24 md:pb-6 space-y-4">
      {/* Back */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.back()} className="h-9 w-9 -ml-1">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-lg font-bold text-foreground">Deal Details</h1>
        <span className="ml-auto text-[11px] text-muted-foreground font-mono">
          Deal ID: #{escrow.id.slice(0, 8).toUpperCase()}
        </span>
      </div>

      {/* Deal in Escrow banner */}
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-emerald-100 grid place-items-center">
              <Shield className="h-4 w-4 text-emerald-600" />
            </div>
            <div>
              <p className="text-sm font-bold text-emerald-700">Deal in Escrow</p>
              <p className="text-[11px] text-emerald-600">Funds are held securely by EasyMeet.</p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-[11px] font-semibold border-emerald-300 text-emerald-700 hover:bg-emerald-100"
          >
            <HelpCircle className="h-3.5 w-3.5 mr-1" />
            How Escrow Works
          </Button>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-4">
          <div>
            <div className="text-[10px] text-emerald-600 font-medium">Escrow Amount</div>
            <div className="text-lg font-extrabold text-foreground">
              {formatNgn(escrow.amount_ngn)}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-emerald-600 font-medium">Paid on</div>
            <div className="text-sm font-semibold text-foreground">{paidOn}</div>
            {paidTime && <div className="text-[11px] text-muted-foreground">{paidTime}</div>}
          </div>
          <div>
            <div className="text-[10px] text-emerald-600 font-medium">Escrow ID</div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-mono text-foreground truncate">
                {escrow.id.slice(0, 12)}...
              </span>
              <button onClick={copyEscrowId} className="text-emerald-600 hover:text-emerald-700">
                <Copy className="h-3.5 w-3.5" />
              </button>
              {copied && <span className="text-[10px] text-emerald-600">Copied!</span>}
            </div>
          </div>
        </div>

        {/* Progress tracker */}
        <div className="flex items-start pt-1">
          {TIMELINE_STEPS.map((step, i) => {
            const status = timeline[step.key];
            const done = status === "completed";
            const active = status === "in_progress";
            const reached = done || active;
            return (
              <div key={step.key} className="flex-1 flex flex-col items-center min-w-0">
                <div className="relative w-full flex items-center justify-center">
                  <span
                    className={cn(
                      "absolute left-0 right-1/2 top-1/2 -translate-y-1/2 h-[2px]",
                      i === 0 ? "opacity-0" : reached ? "bg-emerald-500" : "bg-gray-200",
                    )}
                  />
                  <span
                    className={cn(
                      "absolute left-1/2 right-0 top-1/2 -translate-y-1/2 h-[2px]",
                      i === TIMELINE_STEPS.length - 1
                        ? "opacity-0"
                        : done
                          ? "bg-emerald-500"
                          : "bg-gray-200",
                    )}
                  />
                  {active && (
                    <span className="absolute z-0 h-5 w-5 rounded-full bg-emerald-400/30 animate-ping" />
                  )}
                  <span
                    className={cn(
                      "relative z-[1] h-5 w-5 rounded-full grid place-items-center border-2 transition-colors",
                      done
                        ? "bg-emerald-500 border-emerald-500"
                        : active
                          ? "bg-emerald-500 border-emerald-500 ring-4 ring-emerald-400/20"
                          : "bg-card border-gray-300",
                    )}
                  >
                    {done ? (
                      <CheckCircle2 className="h-3 w-3 text-white" strokeWidth={3} />
                    ) : active ? (
                      <span className="h-1.5 w-1.5 rounded-full bg-white" />
                    ) : null}
                  </span>
                </div>
                <span
                  className={cn(
                    "text-[8px] leading-none whitespace-nowrap mt-2 text-center",
                    reached ? "text-emerald-600 font-semibold" : "text-muted-foreground",
                  )}
                >
                  {i === 0
                    ? "Payment Received"
                    : i === 1
                      ? "In Escrow"
                      : i === 2
                        ? "Complete Job"
                        : "Payment Released"}
                </span>
                {i === 0 && (
                  <span className="text-[8px] text-muted-foreground mt-0.5">{paidOn}</span>
                )}
                {i === 1 && (
                  <span className="text-[8px] text-muted-foreground mt-0.5">
                    {active ? "Funds held securely" : done ? "Done" : "Pending"}
                  </span>
                )}
                {i === 2 && (
                  <span className="text-[8px] text-muted-foreground mt-0.5">
                    {done ? "Done" : "Pending"}
                  </span>
                )}
                {i === 3 && (
                  <span className="text-[8px] text-muted-foreground mt-0.5">
                    {done ? "To Professional" : "Pending"}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Parties */}
      <div className="rounded-2xl border border-border/60 bg-card p-4 space-y-3">
        <h3 className="text-sm font-bold text-foreground">Parties</h3>
        {customer && (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Avatar className="h-10 w-10">
                <AvatarImage src={customer.avatar_url ?? undefined} />
                <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                  {(customer.full_name || customer.username || "U")
                    .split(" ")
                    .map((x) => x[0])
                    .slice(0, 2)
                    .join("")
                    .toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold text-sm text-foreground">
                    {customer.full_name || customer.username || "User"}
                  </span>
                  <VerificationTicks
                    blue={customer.blue_tick}
                    white={customer.white_tick}
                    gold={customer.gold_tick}
                    size="sm"
                  />
                </div>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-[10px] font-semibold capitalize">
                  Customer
                </span>
              </div>
            </div>
            <Link
              to="/messages"
              search={{ c: escrow.conversation_id ?? undefined }}
              className="inline-flex items-center gap-1 text-primary text-[12px] font-semibold hover:underline"
            >
              <MessageCircle className="h-4 w-4" />
              Message
            </Link>
          </div>
        )}
        {professional && (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Avatar className="h-10 w-10">
                <AvatarImage src={professional.avatar_url ?? undefined} />
                <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                  {(professional.full_name || professional.username || "U")
                    .split(" ")
                    .map((x) => x[0])
                    .slice(0, 2)
                    .join("")
                    .toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold text-sm text-foreground">
                    {professional.full_name || professional.username || "User"}
                  </span>
                  <VerificationTicks
                    blue={professional.blue_tick}
                    white={professional.white_tick}
                    gold={professional.gold_tick}
                    size="sm"
                  />
                </div>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-semibold capitalize">
                  Professional
                </span>
              </div>
            </div>
            <Link
              to="/messages"
              search={{ c: escrow.conversation_id ?? undefined }}
              className="inline-flex items-center gap-1 text-primary text-[12px] font-semibold hover:underline"
            >
              <MessageCircle className="h-4 w-4" />
              Message
            </Link>
          </div>
        )}
      </div>

      {/* Deal Summary */}
      <div className="rounded-2xl border border-border/60 bg-card p-4 space-y-3">
        <h3 className="text-sm font-bold text-foreground">Deal Summary</h3>
        <div className="rounded-xl bg-muted/40 border border-border/60 divide-y divide-border/50">
          <div className="flex items-center gap-3 px-3 py-2.5">
            <span className="h-7 w-7 rounded-lg bg-primary/10 grid place-items-center shrink-0">
              <FileText className="h-4 w-4 text-primary" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[11px] text-muted-foreground">Service</div>
              <div className="text-sm font-semibold text-foreground truncate">
                {agreement?.job_title ?? escrow.title ?? "Deal"}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 px-3 py-2.5">
            <span className="h-7 w-7 rounded-lg bg-primary/10 grid place-items-center shrink-0">
              <FileText className="h-4 w-4 text-primary" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[11px] text-muted-foreground">Category</div>
              <div className="text-sm font-semibold text-foreground capitalize">
                {agreement?.agreement_type?.replace(/_/g, " ") ?? "Service"}
              </div>
            </div>
          </div>
          {agreement?.job_description && (
            <div className="px-3 py-2.5">
              <div className="text-[11px] text-muted-foreground mb-1">Description</div>
              <p className="text-[13px] text-foreground/80 leading-snug">
                {agreement.job_description}
              </p>
            </div>
          )}
          <div className="grid grid-cols-3 divide-x divide-border/50">
            <div className="px-3 py-2.5 text-center">
              <div className="text-[10px] text-muted-foreground">Agreed Price</div>
              <div className="text-sm font-bold text-foreground">
                {formatNgn(agreement?.labor_cost ?? agreement?.price ?? escrow.amount_ngn)}
              </div>
            </div>
            <div className="px-3 py-2.5 text-center">
              <div className="text-[10px] text-muted-foreground">EasyMeet Protection Fee</div>
              <div className="text-sm font-bold text-foreground">{formatNgn(protectionFee)}</div>
            </div>
            <div className="px-3 py-2.5 text-center">
              <div className="text-[10px] text-muted-foreground">Total Paid</div>
              <div className="text-sm font-bold text-emerald-600">
                {formatNgn(escrow.amount_ngn + protectionFee)}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Timeline */}
      <div className="rounded-2xl border border-border/60 bg-card p-4 space-y-3">
        <h3 className="text-sm font-bold text-foreground">Timeline</h3>
        <div className="space-y-0">
          {TIMELINE_STEPS.map((step, i) => {
            const status = timeline[step.key];
            const isLast = i === TIMELINE_STEPS.length - 1;
            const dateStr =
              status === "completed"
                ? i === 0 && escrow.paid_at
                  ? new Date(escrow.paid_at).toLocaleString("en-NG", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })
                  : i === 3 && escrow.released_at
                    ? new Date(escrow.released_at).toLocaleString("en-NG", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })
                    : i === 1 && escrow.paid_at
                      ? new Date(escrow.paid_at).toLocaleString("en-NG", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })
                      : ""
                : "";

            return (
              <div key={step.key} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <span
                    className={cn(
                      "h-6 w-6 rounded-full grid place-items-center shrink-0",
                      status === "completed"
                        ? "bg-emerald-500"
                        : status === "in_progress"
                          ? "bg-emerald-500"
                          : "bg-gray-200 border-2 border-gray-300",
                    )}
                  >
                    {status === "completed" ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-white" strokeWidth={3} />
                    ) : status === "in_progress" ? (
                      <span className="h-2 w-2 rounded-full bg-white" />
                    ) : null}
                  </span>
                  {!isLast && (
                    <span
                      className={cn(
                        "w-[2px] flex-1 min-h-[20px]",
                        status === "completed" ? "bg-emerald-500" : "bg-gray-200",
                      )}
                    />
                  )}
                </div>
                <div className="pb-4 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-medium text-foreground">{step.label}</span>
                    <span
                      className={cn(
                        "text-[10px] font-semibold px-2 py-0.5 rounded-full",
                        status === "completed"
                          ? "bg-emerald-100 text-emerald-700"
                          : status === "in_progress"
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-gray-100 text-gray-500",
                      )}
                    >
                      {status === "completed"
                        ? "Completed"
                        : status === "in_progress"
                          ? "In Progress"
                          : "Pending"}
                    </span>
                  </div>
                  {dateStr && (
                    <div className="text-[11px] text-muted-foreground mt-0.5">{dateStr}</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Protected by EasyMeet */}
      <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-full bg-primary/10 grid place-items-center shrink-0">
            <Shield className="h-[18px] w-[18px] text-primary" />
          </div>
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-foreground">
              You're Protected by EasyMeet
            </p>
            <p className="text-[11px] text-muted-foreground leading-tight">
              Your payment is safe. It will only be released when you confirm the job is completed
              to your satisfaction.
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" className="h-8 text-[11px] font-semibold shrink-0">
          Report an Issue
        </Button>
      </div>
    </div>
  );
}
