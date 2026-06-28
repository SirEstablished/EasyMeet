import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { supabase, formatNgn } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/providers";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Shield, ShieldCheck, ShieldX } from "lucide-react";
import { refundPaystackTransaction } from "@/lib/paystack.functions";
import { getDisputedEscrows, type AdminDisputeRow } from "@/lib/admin.functions";

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
    const { data: escrowRows, error } = await supabase
      .from("escrow")
      .select("*")
      .eq("status", "disputed")
      .order("created_at", { ascending: false });
    if (error) {
      toast.error(error.message);
      return;
    }
    const rows = (escrowRows as any[]) ?? [];
    if (rows.length === 0) return setDisputes([]);

    const orderIds = Array.from(new Set(rows.map((r) => r.order_id).filter(Boolean)));
    const userIds = Array.from(
      new Set(rows.flatMap((r) => [r.customer_id, r.provider_id]).filter(Boolean)),
    );

    const [ordersRes, profilesRes] = await Promise.all([
      orderIds.length
        ? supabase.from("orders").select("id, service_title, amount").in("id", orderIds)
        : Promise.resolve({ data: [] as any[] }),
      userIds.length
        ? supabase.from("profiles").select("id, full_name, username, email").in("id", userIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);
    const oMap = new Map(((ordersRes.data as any[]) ?? []).map((o) => [o.id, o]));
    const pMap = new Map(((profilesRes.data as any[]) ?? []).map((p) => [p.id, p]));
    const nameOf = (id: string) => {
      const p = pMap.get(id);
      return p?.full_name || p?.username || p?.email || "Unknown";
    };

    setDisputes(
      rows.map((r) => {
        const o = oMap.get(r.order_id);
        return {
          id: r.id,
          order_id: r.order_id,
          customer_id: r.customer_id,
          provider_id: r.provider_id,
          amount: Number(r.amount_ngn ?? r.amount ?? o?.amount ?? 0),
          status: r.status,
          dispute_reason: r.dispute_reason,
          dispute_evidence: r.dispute_evidence,
          created_at: r.created_at,
          paystack_reference: r.payment_ref ?? r.paystack_reference ?? null,
          service_title: o?.service_title ?? "Order",
          order_amount: Number(o?.amount ?? r.amount_ngn ?? r.amount ?? 0),
          customer_name: nameOf(r.customer_id),
          provider_name: nameOf(r.provider_id),
        } as DisputeRow;
      }),
    );
  }, []);

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin, load]);

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
          const r = await refundPaystackTransaction({
            data: { reference: d.paystack_reference, amountNgn: d.amount },
          });
          if (!r.ok) throw new Error(r.message || "Refund failed");
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
          : `The dispute has been resolved. A refund of ${amountLabel} will be processed to the customer.`;
      const custMessage =
        outcome === "refund"
          ? `The dispute has been resolved in your favour. A refund of ${amountLabel} will be processed to your account.`
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
      <h1 className="text-3xl font-extrabold text-gradient-tri">Disputes</h1>
      <p className="text-sm text-muted-foreground">Review evidence and resolve.</p>
      <div className="mt-6 space-y-4">
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
      </div>
    </div>
  );
}