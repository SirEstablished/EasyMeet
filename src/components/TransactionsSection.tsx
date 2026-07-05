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
import { Download, Loader2, Wallet, CheckCircle2, Shield } from "lucide-react";
import { toast } from "sonner";

type Filter = "all" | "completed" | "in_escrow" | "cancelled" | "refunded";

interface Tx {
  id: string;
  created_at: string;
  service_title: string;
  amount: number;
  counterparty_id: string;
  counterparty_name: string;
  is_outgoing: boolean;
  status: string;
  escrow_status: string | null;
  order_status: string;
  bucket: Exclude<Filter, "all">;
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
          ? supabase.from("profiles").select("id, full_name, username").in("id", counterpartyIds)
          : Promise.resolve({ data: [] as any[] }),
        orderIds.length
          ? supabase.from("escrow").select("order_id, status").in("order_id", orderIds)
          : Promise.resolve({ data: [] as any[] }),
      ]);

      const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p]));
      const escrowMap = new Map((escrows ?? []).map((e: any) => [e.order_id, e.status]));

      const list: Tx[] = rows.map((r: any) => {
        const isOut = r.customer_id === user.id;
        const cpId = isOut ? r.provider_id : r.customer_id;
        const cp = profileMap.get(cpId) as any;
        const escrow_status = escrowMap.get(r.id) ?? r.escrow_status ?? null;
        const bucket = bucketize(r.status, escrow_status);
        return {
          id: r.id,
          created_at: r.created_at,
          service_title: r.service_title || "Order",
          amount: Number(r.amount || 0),
          counterparty_id: cpId,
          counterparty_name: cp?.full_name || cp?.username || "—",
          is_outgoing: isOut,
          status: bucket,
          escrow_status,
          order_status: r.status,
          bucket,
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
    <div className="rounded-2xl glass-card p-6 sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h2 className="font-bold text-xl">Transactions</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Your escrow activity and history.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={exportCsv} disabled={!filtered.length}>
          <Download className="h-4 w-4 mr-2" /> Export CSV
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3 mb-5">
        <StatCard icon={<Wallet className="h-4 w-4" />} label={totalLabel} value={formatNgn(totalAmount)} />
        <StatCard icon={<CheckCircle2 className="h-4 w-4" />} label="Completed deals" value={String(completedCount)} />
        <StatCard icon={<Shield className="h-4 w-4" />} label="Active in escrow" value={String(activeEscrowCount)} />
      </div>

      <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)} className="mb-4">
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="completed">Completed</TabsTrigger>
          <TabsTrigger value="in_escrow">In Escrow</TabsTrigger>
          <TabsTrigger value="cancelled">Cancelled</TabsTrigger>
          <TabsTrigger value="refunded">Refunded</TabsTrigger>
        </TabsList>
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
        <div className="rounded-xl border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Service</TableHead>
                <TableHead>{isCustomer ? "Provider" : "Customer"}</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((t) => {
                const s = statusLabel(t.bucket);
                return (
                  <TableRow key={t.id}>
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
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border p-4 bg-background/40">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
        {icon} {label}
      </div>
      <div className="mt-2 text-2xl font-extrabold tracking-tight text-gradient-brand">{value}</div>
    </div>
  );
}