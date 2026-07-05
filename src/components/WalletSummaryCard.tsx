import { useCallback, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { supabase, formatNgn } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/providers";
import { Button } from "@/components/ui/button";
import { WithdrawDialog } from "@/components/WithdrawDialog";
import { useLiveData } from "@/hooks/use-live-data";
import { Wallet as WalletIcon, ArrowDownToLine, ShieldCheck } from "lucide-react";

export function WalletSummaryCard() {
  const { user } = useAuth();
  const [available, setAvailable] = useState(0);
  const [escrow, setEscrow] = useState(0);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("wallets" as never)
      .select("available_balance, escrow_balance")
      .eq("user_id", user.id)
      .maybeSingle();
    const w = data as { available_balance?: number; escrow_balance?: number } | null;
    setAvailable(Number(w?.available_balance ?? 0));
    setEscrow(Number(w?.escrow_balance ?? 0));
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);
  useLiveData(user ? ["wallets"] : [], load);

  return (
    <div className="rounded-2xl p-5 bg-gradient-brand text-primary-foreground relative overflow-hidden glow-primary">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] opacity-85">
            <WalletIcon className="h-3.5 w-3.5" /> Wallet
          </div>
          <div className="mt-1 text-3xl sm:text-4xl font-extrabold">{formatNgn(available)}</div>
          <div className="mt-1 flex items-center gap-1 text-xs opacity-90">
            <ShieldCheck className="h-3 w-3" /> {formatNgn(escrow)} in escrow
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <Button
            size="sm"
            onClick={() => setOpen(true)}
            disabled={available < 1000}
            className="bg-white text-primary hover:bg-white/90"
          >
            <ArrowDownToLine className="h-4 w-4 mr-1" /> Withdraw
          </Button>
          <Link to="/wallet">
            <Button size="sm" variant="ghost" className="text-primary-foreground hover:bg-white/10 w-full">
              Open wallet
            </Button>
          </Link>
        </div>
      </div>
      <WithdrawDialog open={open} onOpenChange={setOpen} availableBalance={available} onSuccess={load} />
    </div>
  );
}