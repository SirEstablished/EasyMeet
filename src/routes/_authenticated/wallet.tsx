import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { supabase, formatNgn } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/providers";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { WithdrawDialog } from "@/components/WithdrawDialog";
import { useLiveData } from "@/hooks/use-live-data";
import { Wallet as WalletIcon, ArrowDownToLine, TrendingUp, ShieldCheck, Clock } from "lucide-react";

export const Route = createFileRoute("/_authenticated/wallet")({
  component: WalletPage,
});

interface WalletRow {
  user_id: string;
  available_balance: number;
  escrow_balance: number;
  total_withdrawn: number;
  lifetime_earnings: number;
}
interface Tx {
  id: string;
  type: string;
  amount: number;
  balance_after: number;
  note: string | null;
  created_at: string;
}
interface Withdrawal {
  id: string;
  amount: number;
  bank_name: string;
  account_number: string;
  account_name: string;
  status: string;
  rejection_reason: string | null;
  created_at: string;
}

function WalletPage() {
  const { user, profile } = useAuth();
  const role = profile?.role;
  const [wallet, setWallet] = useState<WalletRow | null>(null);
  const [txs, setTxs] = useState<Tx[]>([]);
  const [wds, setWds] = useState<Withdrawal[]>([]);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [liveEscrow, setLiveEscrow] = useState(0);

  const load = useCallback(async () => {
    if (!user) return;
    const [{ data: w }, { data: tx }, { data: wd }, { data: escRows }] = await Promise.all([
      supabase.from("wallets" as never).select("*").eq("user_id", user.id).maybeSingle(),
      supabase
        .from("wallet_transactions" as never)
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("withdrawal_requests" as never)
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("escrow" as never)
        .select("amount, amount_ngn, payout_amount")
        .or(`provider_id.eq.${user.id},professional_id.eq.${user.id}`)
        .eq("status", "holding"),
    ]);
    const row = (w as WalletRow | null) ?? {
      user_id: user.id,
      available_balance: 0,
      escrow_balance: 0,
      total_withdrawn: 0,
      lifetime_earnings: 0,
    };
    setWallet(row);
    setTxs((tx as Tx[] | null) ?? []);
    setWds((wd as Withdrawal[] | null) ?? []);
    const live = ((escRows ?? []) as {
      amount: number | null;
      amount_ngn: number | null;
      payout_amount: number | null;
    }[]).reduce(
      (s, e) => s + Number(e.payout_amount ?? e.amount_ngn ?? e.amount ?? 0),
      0,
    );
    setLiveEscrow(live);
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  useLiveData(
    user ? ["wallets", "wallet_transactions", "withdrawal_requests", "escrow"] : [],
    load,
  );

  if (!user) return null;
  if (role && role !== "professional" && role !== "business") {
    return (
      <div className="max-w-xl mx-auto px-5 sm:px-8 lg:px-12 py-16 text-center">
        <WalletIcon className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
        <h1 className="text-2xl font-bold">Wallet is for professionals & businesses</h1>
        <p className="text-sm text-muted-foreground mt-2">
          Customer accounts don't earn payouts.
        </p>
        <Link to="/dashboard" className="inline-block mt-6">
          <Button>Back to dashboard</Button>
        </Link>
      </div>
    );
  }

  const available = wallet?.available_balance ?? 0;
  const escrow = Math.max(wallet?.escrow_balance ?? 0, liveEscrow);
  const withdrawn = wallet?.total_withdrawn ?? 0;
  const lifetime = wallet?.lifetime_earnings ?? 0;
  const shownTxs = showAll ? txs : txs.slice(0, 10);

  const statusBadge = (s: string) => {
    const map: Record<string, string> = {
      pending: "bg-yellow-500/15 text-yellow-500 border-yellow-500/30",
      processing: "bg-blue-500/15 text-blue-500 border-blue-500/30",
      completed: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
      rejected: "bg-red-500/15 text-red-500 border-red-500/30",
    };
    return (
      <Badge variant="outline" className={`capitalize ${map[s] ?? ""}`}>{s}</Badge>
    );
  };

  return (
    <div className="max-w-5xl mx-auto px-5 sm:px-8 lg:px-12 py-4 sm:py-8 pb-24 md:pb-8 space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Wallet</h1>
        <p className="text-xs sm:text-sm text-muted-foreground mt-1">
          Manage your earnings and withdrawals.
        </p>
      </div>

      {/* Balance hero */}
      <div className="rounded-2xl p-5 sm:p-8 bg-gradient-brand text-primary-foreground relative overflow-hidden glow-primary">
        <div className="text-xs uppercase tracking-[0.2em] opacity-80">Available balance</div>
        <div className="mt-1 text-4xl sm:text-5xl font-extrabold">{formatNgn(available)}</div>
        <Button
          onClick={() => setWithdrawOpen(true)}
          disabled={available < 1000}
          className="mt-4 bg-white text-primary hover:bg-white/90"
        >
          <ArrowDownToLine className="h-4 w-4 mr-2" /> Withdraw
        </Button>
        {available < 1000 && (
          <p className="mt-2 text-xs opacity-90">Minimum withdrawal is ₦1,000</p>
        )}
      </div>

      {/* Stats */}
      <div className="grid gap-3 sm:gap-4 grid-cols-2 md:grid-cols-3">
        <StatCard icon={ShieldCheck} label="Money in escrow" value={formatNgn(escrow)} />
        <StatCard icon={Clock} label="Total withdrawn" value={formatNgn(withdrawn)} />
        <StatCard icon={TrendingUp} label="Lifetime earnings" value={formatNgn(lifetime)} />
      </div>

      {/* Recent transactions */}
      <div className="rounded-2xl glass-card p-4 sm:p-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold">Recent transactions</h2>
          {txs.length > 10 && (
            <Button variant="ghost" size="sm" onClick={() => setShowAll((v) => !v)}>
              {showAll ? "Show less" : "View all"}
            </Button>
          )}
        </div>
        {shownTxs.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">No transactions yet.</p>
        ) : (
          <ul className="divide-y divide-border/60">
            {shownTxs.map((t) => {
              const negativeTypes = new Set([
                "withdrawal",
                "debit",
                "fee",
                "transfer_out",
                "payment",
                "payout",
                "charge",
              ]);
              const positive = !negativeTypes.has(t.type);
              return (
                <li key={t.id} className="py-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium capitalize">{t.type}</div>
                    <div className="text-xs text-muted-foreground truncate">{t.note}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {new Date(t.created_at).toLocaleString()}
                    </div>
                  </div>
                  <div className={`text-sm font-bold ${positive ? "text-emerald-500" : "text-red-500"}`}>
                    {positive ? "+" : "−"}{formatNgn(t.amount)}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Withdrawal history */}
      <div className="rounded-2xl glass-card p-4 sm:p-6">
        <h2 className="font-bold mb-3">Withdrawal history</h2>
        {wds.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">No withdrawals yet.</p>
        ) : (
          <ul className="space-y-3">
            {wds.map((w) => (
              <li key={w.id} className="rounded-lg border border-border/60 p-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold">{formatNgn(w.amount)}</span>
                  {statusBadge(w.status)}
                  <span className="ml-auto text-xs text-muted-foreground">
                    {new Date(w.created_at).toLocaleDateString()}
                  </span>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {w.bank_name} • {w.account_number} • {w.account_name}
                </div>
                {w.status === "rejected" && w.rejection_reason && (
                  <div className="mt-2 text-xs text-red-500">
                    Reason: {w.rejection_reason}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Auto-withdrawal */}
      <div className="rounded-2xl glass-card p-4 sm:p-6 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-bold">Auto-withdrawal</h2>
            <p className="text-xs text-muted-foreground">
              Automatically withdraw when your balance reaches the threshold.
            </p>
          </div>
          <Switch checked={autoOn} onCheckedChange={setAutoOn} />
        </div>
        {autoOn && (
          <div>
            <Label htmlFor="thr">Threshold (NGN)</Label>
            <Input
              id="thr"
              type="number"
              min={1000}
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              placeholder="10000"
            />
          </div>
        )}
        <Button size="sm" onClick={saveAuto} variant="outline">Save settings</Button>
      </div>

      <WithdrawDialog
        open={withdrawOpen}
        onOpenChange={setWithdrawOpen}
        availableBalance={available}
        onSuccess={load}
      />
    </div>
  );
}

function StatCard({ icon: Icon, label, value }: { icon: typeof WalletIcon; label: string; value: string }) {
  return (
    <div className="rounded-2xl glass-card p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wider">
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      <div className="mt-2 text-xl sm:text-2xl font-extrabold">{value}</div>
    </div>
  );
}