import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { supabase, formatNgn } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/providers";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Loader2, Shield, ShieldCheck, ShieldX } from "lucide-react";
import { refundPaystackTransaction } from "@/lib/paystack.functions";
import { getDisputedEscrows, type AdminDisputeRow } from "@/lib/admin.functions";
import { useLiveData } from "@/hooks/use-live-data";

export const Route = createFileRoute("/_authenticated/admin/disputes")({
  component: AdminDisputesPage,
});

type DisputeRow = AdminDisputeRow;

function AdminDisputesPage() {
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [disputes, setDisputes] = useState<DisputeRow[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRow[]>([]);
  const [wdBusyId, setWdBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle()
      .then(({ data }) => setIsAdmin(!!data));
  }, [user]);

  const load = useCallback(async () => {
    try {
      const rows = await getDisputedEscrows({ data: undefined });
      setDisputes(rows);
    } catch (e) {
      // Fallback to direct client query (RLS allows admins to see disputes).
      try {
        const { data, error } = await supabase
          .from("escrow")
          .select(
            "*, orders(*), customer:profiles!escrow_customer_id_fkey(*), provider:profiles!escrow_provider_id_fkey(*)",
          )
          .eq("status", "disputed")
          .order("created_at", { ascending: false });
        if (error) throw error;
        const mapped: DisputeRow[] = ((data as any[]) ?? []).map((r) => {
          const amount = Number(r.amount_ngn ?? r.amount ?? r.orders?.amount ?? 0);
          const nameOf = (p: any) =>
            p?.full_name || p?.username || p?.email || "Unknown";
          return {
            id: r.id,
            order_id: r.order_id,
            customer_id: r.customer_id,
            provider_id: r.provider_id,
            conversation_id: r.conversation_id ?? null,
            amount,
            status: r.status,
            dispute_reason: r.dispute_reason,
            dispute_evidence: Array.isArray(r.dispute_evidence) ? r.dispute_evidence : null,
            created_at: r.created_at,
            payment_ref: r.payment_ref ?? null,
            paystack_reference: r.payment_ref ?? r.paystack_reference ?? null,
            service_title: r.orders?.service_title ?? "Order",
            order_amount: Number(r.orders?.amount ?? amount),
            customer_name: nameOf(r.customer),
            provider_name: nameOf(r.provider),
          };
        });
        setDisputes(mapped);
      } catch (e2) {
        toast.error(e2 instanceof Error ? e2.message : "Could not load disputes");
      }
    }
  }, []);

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin, load]);

  useLiveData(isAdmin ? ["escrow", "escrow_disputes", "orders"] : [], load);

  const loadWithdrawals = useCallback(async () => {
    const { data } = await supabase
      .from("withdrawal_requests" as never)
      .select("*")
      .in("status", ["pending", "processing"])
      .order("created_at", { ascending: false });
    const rows = ((data as WithdrawalRow[] | null) ?? []);
    const ids = Array.from(new Set(rows.map((r) => r.user_id)));
    let names = new Map<string, string>();
    if (ids.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, full_name, username, email")
        .in("id", ids);
      names = new Map((profs ?? []).map((p: any) => [p.id, p.full_name || p.username || p.email || "Unknown"]));
    }
    setWithdrawals(rows.map((r) => ({ ...r, user_name: names.get(r.user_id) ?? "Unknown" })));
  }, []);

  useEffect(() => {
    if (isAdmin) void loadWithdrawals();
  }, [isAdmin, loadWithdrawals]);
  useLiveData(isAdmin ? ["withdrawal_requests"] : [], loadWithdrawals);

  const approveWithdrawal = async (w: WithdrawalRow) => {
    setWdBusyId(w.id);
    try {
      const { error } = await supabase.rpc("admin_approve_withdrawal" as never, {
        p_withdrawal_id: w.id,
        p_transfer_ref: null,
      } as never);
      if (error) throw error;
      await supabase.from("notifications").insert({
        user_id: w.user_id,
        title: "Withdrawal completed ✅",
        message: `Your withdrawal of ${formatNgn(w.amount)} has been processed.`,
        type: "wallet",
      } as never);
      toast.success("Withdrawal approved");
      setWithdrawals((cur) => cur.filter((x) => x.id !== w.id));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Approve failed");
    } finally {
      setWdBusyId(null);
    }
  };

  const rejectWithdrawal = async (w: WithdrawalRow) => {
    const reason = window.prompt("Reason for rejection?");
    if (!reason) return;
    setWdBusyId(w.id);
    try {
      const { error } = await supabase.rpc("admin_reject_withdrawal" as never, {
        p_withdrawal_id: w.id,
        p_reason: reason,
      } as never);
      if (error) throw error;
      await supabase.from("notifications").insert({
        user_id: w.user_id,
        title: "Withdrawal rejected",
        message: `Your withdrawal of ${formatNgn(w.amount)} was rejected. Reason: ${reason}. The amount has been returned to your wallet.`,
        type: "wallet",
      } as never);
      toast.success("Withdrawal rejected and refunded to wallet");
      setWithdrawals((cur) => cur.filter((x) => x.id !== w.id));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Reject failed");
    } finally {
      setWdBusyId(null);
    }
  };

  const resolve = async (d: DisputeRow, outcome: "release" | "refund") => {
    setBusyId(d.id);
    try {
      if (outcome === "release") {
        if (!d.order_id) throw new Error("Missing order id");
        const { error } = await supabase.rpc("release_escrow_payment", {
          p_escrow_id: d.id,
          p_order_id: d.order_id,
        });
        if (error) throw error;
      } else {
        if (d.paystack_reference) {
          // Best-effort Paystack refund; do not block the escrow state change
          // if the gateway rejects (already refunded, test-mode limits, etc.).
          try {
            const r = await refundPaystackTransaction({
              data: { reference: d.paystack_reference, amountNgn: d.amount },
            });
            if (!r.ok) console.warn("Paystack refund not queued:", r.message);
          } catch (err) {
            console.warn("Paystack refund threw:", err);
          }
        }
        const { error } = await supabase
          .from("escrow")
          .update({
            status: "refunded",
            refund_status: "processing",
            refund_amount: d.amount,
            refunded_at: new Date().toISOString(),
          })
          .eq("id", d.id);
        if (error) throw error;
        if (d.order_id) {
          await supabase
            .from("orders")
            .update({ status: "refunded", payment_status: "refunded" })
            .eq("id", d.order_id);
        }
      }
      // Best-effort: also mark legacy dispute row + log resolution note
      await supabase
        .from("escrow_disputes")
        .update({
          status: outcome === "release" ? "resolved_release" : "resolved_refund",
          resolution_note: notes[d.id] || null,
          resolved_by: user!.id,
          resolved_at: new Date().toISOString(),
        })
        .eq("order_id", d.id);
      // Notify both parties of the resolution.
      const amountLabel = formatNgn(d.amount);
      const proMessage =
        outcome === "release"
          ? `The dispute has been resolved in your favour. Payment of ${amountLabel} has been released to your account.`
          : `The dispute has been resolved. A refund of ${amountLabel} will be processed to the customer within 3-5 business days.`;
      const custMessage =
        outcome === "refund"
          ? `Your dispute has been resolved. A refund of ${amountLabel} will be processed to your account within 3-5 business days.`
          : `The dispute has been resolved. Payment of ${amountLabel} has been released to the professional.`;
      await supabase.from("notifications").insert([
        {
          user_id: d.provider_id,
          title: "Dispute Resolved ✅",
          message: proMessage,
          type: "dispute_resolved",
        },
        {
          user_id: d.customer_id,
          title: "Dispute Resolved ✅",
          message: custMessage,
          type: "dispute_resolved",
        },
      ] as never);
      // Post a chat message into the conversation so both parties see the outcome inline.
      if (d.conversation_id) {
        const outcomeText =
          outcome === "release"
            ? `Payment of ${amountLabel} has been released to the professional.`
            : `A refund of ${amountLabel} will be processed to the customer within 3-5 business days.`;
        await supabase.from("messages").insert({
          conversation_id: d.conversation_id,
          sender_id: user!.id,
          body: `⚖️ This dispute has been resolved by EasyMeet admin. ${outcomeText}`,
        } as never);
      }
      toast.success(
        outcome === "release" ? "Payment released to professional" : "Refund issued to customer",
      );
      setDisputes((cur) => cur.filter((x) => x.id !== d.id));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not resolve dispute");
    } finally {
      setBusyId(null);
    }
  };

  if (!user) return null;
  if (isAdmin === null)
    return (
      <div className="p-10 flex justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  if (!isAdmin)
    return (
      <div className="max-w-xl mx-auto p-10 text-center">
        <Shield className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
        <h1 className="text-xl font-bold">Admins only</h1>
        <p className="text-sm text-muted-foreground">You don't have access to this page.</p>
      </div>
    );

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-extrabold text-gradient-tri">Admin</h1>
      <p className="text-sm text-muted-foreground">Review disputes and process withdrawals.</p>
      <Tabs defaultValue="disputes" className="mt-6">
        <TabsList>
          <TabsTrigger value="disputes">Disputes</TabsTrigger>
          <TabsTrigger value="withdrawals">
            Withdrawals{withdrawals.length > 0 ? ` (${withdrawals.length})` : ""}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="disputes" className="space-y-4 mt-4">
        {disputes.length === 0 && (
          <p className="text-sm text-muted-foreground">No disputes.</p>
        )}
        {disputes.map((d) => (
          <div key={d.id} className="rounded-2xl glass-card p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">{d.service_title}</span>
              <Badge variant="outline" className="capitalize">disputed</Badge>
              <span className="ml-auto font-bold text-gradient-brand">{formatNgn(d.amount)}</span>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <div><span className="font-medium text-foreground">Customer:</span> {d.customer_name}</div>
              <div><span className="font-medium text-foreground">Professional:</span> {d.provider_name}</div>
              <div className="col-span-2">
                <span className="font-medium text-foreground">Opened:</span>{" "}
                {new Date(d.created_at).toLocaleString()}
              </div>
            </div>
            <div className="mt-3">
              <p className="text-xs font-medium text-foreground">Dispute reason</p>
              <p className="text-sm whitespace-pre-wrap">
                {d.dispute_reason || "No reason provided."}
              </p>
            </div>
            {Array.isArray(d.dispute_evidence) && d.dispute_evidence.length > 0 && (
              <div className="mt-3">
                <p className="text-xs font-medium text-foreground mb-1">Evidence</p>
                <ul className="space-y-1 text-xs">
                  {(d.dispute_evidence as any[]).map((url, i) => {
                    const href = typeof url === "string" ? url : (url?.url ?? url?.file_url ?? "");
                    if (!href) return null;
                    return (
                      <li key={i}>
                        <a
                          href={href}
                          target="_blank"
                          rel="noreferrer"
                          className="text-primary underline break-all"
                        >
                          {href}
                        </a>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
            <div className="mt-3 space-y-2">
              <Textarea
                placeholder="Resolution note (optional)"
                value={notes[d.id] ?? ""}
                onChange={(e) => setNotes((n) => ({ ...n, [d.id]: e.target.value }))}
                rows={2}
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  onClick={() => resolve(d, "release")}
                  disabled={busyId === d.id}
                  className="bg-gradient-brand"
                >
                  <ShieldCheck className="h-4 w-4 mr-1" /> Release to Professional
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => resolve(d, "refund")}
                  disabled={busyId === d.id}
                >
                  <ShieldX className="h-4 w-4 mr-1" /> Refund to Customer
                </Button>
              </div>
            </div>
          </div>
        ))}
        </TabsContent>
        <TabsContent value="withdrawals" className="space-y-3 mt-4">
          {withdrawals.length === 0 && (
            <p className="text-sm text-muted-foreground">No pending withdrawals.</p>
          )}
          {withdrawals.map((w) => (
            <div key={w.id} className="rounded-2xl glass-card p-4">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold">{w.user_name}</span>
                <Badge variant="outline" className="capitalize">{w.status}</Badge>
                <span className="ml-auto font-bold text-gradient-brand">{formatNgn(w.amount)}</span>
              </div>
              <div className="mt-2 text-xs text-muted-foreground">
                {w.bank_name} • {w.account_number} • {w.account_name}
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground">
                Requested {new Date(w.created_at).toLocaleString()}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  onClick={() => approveWithdrawal(w)}
                  disabled={wdBusyId === w.id}
                  className="bg-gradient-brand"
                >
                  <ShieldCheck className="h-4 w-4 mr-1" /> Approve
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => rejectWithdrawal(w)}
                  disabled={wdBusyId === w.id}
                >
                  <ShieldX className="h-4 w-4 mr-1" /> Reject
                </Button>
              </div>
            </div>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}

interface WithdrawalRow {
  id: string;
  user_id: string;
  amount: number;
  bank_name: string;
  account_number: string;
  account_name: string;
  status: string;
  created_at: string;
  user_name?: string;
}