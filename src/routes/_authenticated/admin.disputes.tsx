import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { supabase, formatNgn } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/providers";
import type { EscrowDispute, EscrowOrder } from "@/lib/escrow";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Shield, ShieldCheck, ShieldX } from "lucide-react";
import { refundPaystackTransaction } from "@/lib/paystack.functions";

export const Route = createFileRoute("/_authenticated/admin/disputes")({
  component: AdminDisputesPage,
});

interface DisputeWithOrder extends EscrowDispute {
  order: EscrowOrder | null;
  evidence: Array<{
    id: string;
    uploaded_by: string;
    note: string | null;
    file_url: string | null;
    is_chat_snapshot: boolean;
    payload: unknown;
    created_at: string;
  }>;
}

function AdminDisputesPage() {
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [disputes, setDisputes] = useState<DisputeWithOrder[]>([]);
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
    const { data: ds } = await supabase
      .from("escrow_disputes")
      .select("*")
      .order("created_at", { ascending: false });
    const list = (ds as EscrowDispute[]) ?? [];
    if (list.length === 0) return setDisputes([]);
    const ids = list.map((d) => d.id);
    const orderIds = list.map((d) => d.order_id);
    const [{ data: orders }, { data: ev }] = await Promise.all([
      supabase.from("escrow_orders").select("*").in("id", orderIds),
      supabase.from("escrow_dispute_evidence").select("*").in("dispute_id", ids),
    ]);
    const oMap = new Map((orders as EscrowOrder[] | null ?? []).map((o) => [o.id, o]));
    setDisputes(
      list.map((d) => ({
        ...d,
        order: oMap.get(d.order_id) ?? null,
        evidence: ((ev as DisputeWithOrder["evidence"]) ?? []).filter((e) => (e as any).dispute_id === d.id),
      })),
    );
  }, []);

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin, load]);

  const resolve = async (d: DisputeWithOrder, outcome: "release" | "refund") => {
    if (!d.order) return;
    setBusyId(d.id);
    if (outcome === "release") {
      await supabase
        .from("escrow_orders")
        .update({ status: "completed", released_at: new Date().toISOString() })
        .eq("id", d.order_id);
    } else {
      if (d.order.paystack_reference) {
        const r = await refundPaystackTransaction({
          data: { reference: d.order.paystack_reference, amountNgn: d.order.amount_ngn },
        });
        if (!r.ok) {
          setBusyId(null);
          return toast.error(r.message || "Refund failed");
        }
      }
      await supabase
        .from("escrow_orders")
        .update({
          status: "refunded",
          refund_status: "processing",
          refund_amount: d.order.amount_ngn,
          refunded_at: new Date().toISOString(),
        })
        .eq("id", d.order_id);
    }
    await supabase
      .from("escrow_disputes")
      .update({
        status: outcome === "release" ? "resolved_release" : "resolved_refund",
        resolution_note: notes[d.id] || null,
        resolved_by: user!.id,
        resolved_at: new Date().toISOString(),
      })
      .eq("id", d.id);
    setBusyId(null);
    toast.success("Dispute resolved");
    load();
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
              <span className="font-semibold">{d.order?.title ?? "Order"}</span>
              <Badge variant="outline" className="capitalize">{d.status.replace("_", " ")}</Badge>
              {d.order && (
                <span className="ml-auto font-bold text-gradient-brand">{formatNgn(d.order.amount_ngn)}</span>
              )}
            </div>
            <p className="mt-2 text-sm whitespace-pre-wrap">{d.reason}</p>
            {d.evidence.length > 0 && (
              <details className="mt-2 text-xs">
                <summary className="cursor-pointer text-primary">View {d.evidence.length} evidence item(s)</summary>
                <ul className="mt-2 space-y-2">
                  {d.evidence.map((e) => (
                    <li key={e.id} className="border border-border rounded p-2">
                      {e.is_chat_snapshot ? (
                        <pre className="overflow-auto max-h-60 whitespace-pre-wrap text-[11px]">
                          {JSON.stringify(e.payload, null, 2)}
                        </pre>
                      ) : (
                        <>
                          {e.note && <p className="whitespace-pre-wrap">{e.note}</p>}
                          {e.file_url && (
                            <a href={e.file_url} target="_blank" rel="noreferrer" className="text-primary underline">
                              {e.file_url}
                            </a>
                          )}
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              </details>
            )}
            {d.status === "open" && (
              <div className="mt-3 space-y-2">
                <Textarea
                  placeholder="Resolution note (optional)"
                  value={notes[d.id] ?? ""}
                  onChange={(e) => setNotes((n) => ({ ...n, [d.id]: e.target.value }))}
                  rows={2}
                />
                <div className="flex gap-2">
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
                    <ShieldX className="h-4 w-4 mr-1" /> Refund Customer
                  </Button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}