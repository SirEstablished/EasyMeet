import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase, formatNgn } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/providers";
import { useLiveData } from "@/hooks/use-live-data";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Download, Loader2, Wallet, CheckCircle2, Shield, ChevronDown } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";

type Filter = "all" | "completed" | "in_escrow" | "cancelled" | "refunded";

interface Tx {
  id: string;
  created_at: string;
  service_title: string;
  amount: number;
  counterparty_id: string;
  counterparty_name: string;
  counterparty_avatar: string | null;
  is_outgoing: boolean;
  status: string;
  escrow_status: string | null;
  order_status: string;
  bucket: Exclude<Filter, "all">;
  commission: number;
  payout: number;
  payment_ref: string | null;
  escrow_stage: string | null;
  agreement_type: string | null;
}

function bucketize(order_status: string, escrow_status: string | null): Tx["bucket"] {
  const es = (escrow_status || "").toLowerCase();
  const os = (order_status || "").toLowerCase();
  if (es === "refunded" || os === "refunded") return "refunded";
  if (es === "cancelled" || os === "cancelled") return "cancelled";
  if (es === "released" || os === "completed") return "completed";
  if (es === "holding" || es === "in_progress" || es === "pending_payment" || es === "disputed")
    return "in_escrow";
  return "in_escrow";
}

function statusLabel(b: Tx["bucket"]): { label: string; variant: "default" | "secondary" | "destructive" | "outline" } {
  switch (b) {
    case "completed":
      return { label: "Completed", variant: "default" };
    case "in_escrow":
      return { label: "In Escrow", variant: "secondary" };
    case "cancelled":
      return { label: "Cancelled", variant: "outline" };
    case "refunded":
      return { label: "Refunded", variant: "destructive" };
  }
}

function csvEscape(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function TransactionsSection() {
  const { user, profile } = useAuth();
  const isCustomer = profile?.role === "customer";
  const [txs, setTxs] = useState<Tx[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const toggle = (id: string) => setExpandedId((cur) => (cur === id ? null : id));

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const { data: orders, error } = await supabase
        .from("orders")
        .select("*")
        .or(`customer_id.eq.${user.id},provider_id.eq.${user.id}`)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const rows = orders ?? [];
      const orderIds = rows.map((r: any) => r.id);
      const counterpartyIds = Array.from(
        new Set(
          rows.map((r: any) => (r.customer_id === user.id ? r.provider_id : r.customer_id)),
        ),
      );

      const [{ data: profiles }, { data: escrows }] = await Promise.all([
        counterpartyIds.length
          ? supabase
              .from("profiles")
              .select("id, full_name, username, avatar_url")
              .in("id", counterpartyIds)
          : Promise.resolve({ data: [] as any[] }),
        orderIds.length
          ? supabase
              .from("escrow")
              .select(
                "order_id, status, stage, commission_amount, payout_amount, payment_ref, agreement_type",
              )
              .in("order_id", orderIds)
          : Promise.resolve({ data: [] as any[] }),
      ]);

      const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p]));
      const escrowMap = new Map((escrows ?? []).map((e: any) => [e.order_id, e]));

      const list: Tx[] = rows.map((r: any) => {
        const isOut = r.customer_id === user.id;
        const cpId = isOut ? r.provider_id : r.customer_id;
        const cp = profileMap.get(cpId) as any;
        const esc = escrowMap.get(r.id) as any | undefined;
        const escrow_status = esc?.status ?? r.escrow_status ?? null;
        const bucket = bucketize(r.status, escrow_status);
        return {
          id: r.id,
          created_at: r.created_at,
          service_title: r.service_title || "Order",
          amount: Number(r.amount || 0),
          counterparty_id: cpId,
          counterparty_name: cp?.full_name || cp?.username || "—",
          counterparty_avatar: cp?.avatar_url ?? null,
          is_outgoing: isOut,
          status: bucket,
          escrow_status,
          order_status: r.status,
          bucket,
          commission: Number(esc?.commission_amount ?? r.commission_amount ?? 0),
          payout: Number(esc?.payout_amount ?? r.payout_amount ?? 0),
          payment_ref: esc?.payment_ref ?? r.payment_ref ?? null,
          escrow_stage: esc?.stage ?? r.escrow_stage ?? null,
          agreement_type: esc?.agreement_type ?? null,
        };
      });
      setTxs(list);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load transactions");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    load();
  }, [user, load]);

  useLiveData(["orders", "escrow"], load);

  const relevantTxs = useMemo(() => {
    // Customers see spending (outgoing); providers/business see earnings (incoming).
    return txs.filter((t) => (isCustomer ? t.is_outgoing : !t.is_outgoing));
  }, [txs, isCustomer]);

  const totalAmount = useMemo(
    () => relevantTxs.filter((t) => t.bucket === "completed").reduce((s, t) => s + t.amount, 0),
    [relevantTxs],
  );
  const completedCount = relevantTxs.filter((t) => t.bucket === "completed").length;
  const activeEscrowCount = relevantTxs.filter((t) => t.bucket === "in_escrow").length;

  const filtered = useMemo(
    () => (filter === "all" ? relevantTxs : relevantTxs.filter((t) => t.bucket === filter)),
    [filter, relevantTxs],
  );

  const exportCsv = () => {
    const headers = ["Date", "Service", "Counterparty", "Direction", "Amount (NGN)", "Status"];
    const lines = [headers.join(",")];
    for (const t of filtered) {
      lines.push(
        [
          new Date(t.created_at).toISOString(),
          csvEscape(t.service_title),
          csvEscape(t.counterparty_name),
          t.is_outgoing ? "Spent" : "Earned",
          t.amount,
          statusLabel(t.bucket).label,
        ].join(","),
      );
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `transactions-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const totalLabel = isCustomer ? "Total spent" : "Total earned";

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-4 sm:p-6 w-full">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2 mb-4 sm:mb-5">
        <div className="min-w-0">
          <h2 className="font-bold text-lg sm:text-xl">Transactions</h2>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            Your escrow activity and history.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={exportCsv} disabled={!filtered.length} className="shrink-0">
          <Download className="h-4 w-4 sm:mr-2" />
          <span className="hidden sm:inline">Export CSV</span>
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-1 sm:gap-3 mb-4 sm:mb-5 overflow-hidden">
        <StatCard icon={<Wallet className="h-3.5 w-3.5" />} label={totalLabel} value={formatNgn(totalAmount)} />
        <StatCard icon={<CheckCircle2 className="h-3.5 w-3.5" />} label="Completed" value={String(completedCount)} />
        <StatCard icon={<Shield className="h-3.5 w-3.5" />} label="In escrow" value={String(activeEscrowCount)} />
      </div>

      <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)} className="mb-4">
        <div className="overflow-x-auto -mx-4 px-4">
          <TabsList className="inline-flex h-auto w-max whitespace-nowrap">
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="completed">Completed</TabsTrigger>
            <TabsTrigger value="in_escrow">In Escrow</TabsTrigger>
            <TabsTrigger value="cancelled">Cancelled</TabsTrigger>
            <TabsTrigger value="refunded">Refunded</TabsTrigger>
          </TabsList>
        </div>
      </Tabs>

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground py-6">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading transactions…
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-sm text-muted-foreground py-6 text-center">
          No transactions to show.
        </div>
      ) : (
        <>
        {/* Mobile card list */}
        <ul className="sm:hidden space-y-2">
          {filtered.map((t) => {
            const s = statusLabel(t.bucket);
            const open = expandedId === t.id;
            return (
              <li key={t.id} className="rounded-xl border border-border/60 p-3 bg-card w-full">
                <button
                  type="button"
                  onClick={() => toggle(t.id)}
                  aria-expanded={open}
                  className="w-full text-left flex items-start justify-between gap-2"
                >
                  <div className="min-w-0">
                    <div className="font-semibold text-sm truncate">{t.service_title}</div>
                    <div className="text-xs text-muted-foreground truncate mt-0.5">
                      {isCustomer ? "To" : "From"} {t.counterparty_name}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <Badge variant={s.variant} className="text-[10px]">{s.label}</Badge>
                    <ChevronDown
                      className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
                    />
                  </div>
                </button>
                <div className="flex items-end justify-between mt-2">
                  <span className="text-[11px] text-muted-foreground">
                    {new Date(t.created_at).toLocaleDateString()}
                  </span>
                  <span className="font-bold text-sm whitespace-nowrap">{formatNgn(t.amount)}</span>
                </div>
                {open && <TxDetails t={t} className="mt-3 pt-3 border-t border-border/60" />}
              </li>
            );
          })}
        </ul>

        {/* Desktop table */}
        <div className="hidden sm:block rounded-xl border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Service</TableHead>
                <TableHead>{isCustomer ? "Provider" : "Customer"}</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-8"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((t) => {
                const s = statusLabel(t.bucket);
                const open = expandedId === t.id;
                return (
                  <>
                  <TableRow
                    key={t.id}
                    onClick={() => toggle(t.id)}
                    className="cursor-pointer"
                    aria-expanded={open}
                  >
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {new Date(t.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="font-medium">{t.service_title}</TableCell>
                    <TableCell>{t.counterparty_name}</TableCell>
                    <TableCell className="text-right font-semibold whitespace-nowrap">
                      {formatNgn(t.amount)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={s.variant}>{s.label}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <ChevronDown
                        className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
                      />
                    </TableCell>
                  </TableRow>
                  {open && (
                    <TableRow key={t.id + "-details"}>
                      <TableCell colSpan={6} className="bg-muted/30">
                        <TxDetails t={t} />
                      </TableCell>
                    </TableRow>
                  )}
                  </>
                );
              })}
            </TableBody>
          </Table>
        </div>
        </>
      )}
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border p-2.5 sm:p-4 bg-background/40 min-w-0">
      <div className="flex items-center gap-1 sm:gap-2 text-[9px] sm:text-xs uppercase tracking-wider text-muted-foreground truncate">
        <span className="shrink-0">{icon}</span>
        <span className="truncate">{label}</span>
      </div>
      <div className="mt-1 sm:mt-2 text-sm sm:text-2xl font-extrabold tracking-tight text-gradient-brand truncate">{value}</div>
    </div>
  );
}

function TxDetails({ t, className }: { t: Tx; className?: string }) {
  const initials = (t.counterparty_name || "?")
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <div className={`animate-accordion-down ${className ?? ""}`}>
      <div className="flex items-center gap-3 mb-3">
        <Avatar className="h-9 w-9">
          {t.counterparty_avatar && <AvatarImage src={t.counterparty_avatar} alt={t.counterparty_name} />}
          <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">
            {initials}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <div className="text-sm font-semibold truncate">{t.counterparty_name}</div>
          <div className="text-[11px] text-muted-foreground truncate">{t.service_title}</div>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-xs">
        <DetailRow label="Amount" value={formatNgn(t.amount)} />
        <DetailRow label="EasyMeet Protection Fee" value={formatNgn(t.commission)} />
        <DetailRow label="Payout" value={formatNgn(t.payout)} />
        <DetailRow label="Payment ref" value={t.payment_ref || "—"} mono />
        <DetailRow label="Date" value={new Date(t.created_at).toLocaleString()} />
        <DetailRow label="Escrow stage" value={t.escrow_stage || t.escrow_status || "—"} />
        <DetailRow
          label="Agreement type"
          value={(t.agreement_type || "—").replace(/_/g, " ")}
        />
        <DetailRow label="Direction" value={t.is_outgoing ? "Spent" : "Earned"} />
      </div>
    </div>
  );
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div
        className={`text-[12px] font-medium text-foreground truncate ${mono ? "font-mono" : ""}`}
        title={value}
      >
        {value}
      </div>
    </div>
  );
}
