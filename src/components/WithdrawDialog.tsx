import { useState } from "react";
import { supabase, formatNgn } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { NIGERIAN_BANKS } from "@/lib/fees";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  availableBalance: number;
  defaults?: { bank_name?: string | null; account_number?: string | null; account_name?: string | null };
  onSuccess?: () => void;
}

export function WithdrawDialog({ open, onOpenChange, availableBalance, defaults, onSuccess }: Props) {
  const [amount, setAmount] = useState("");
  const [bank, setBank] = useState(defaults?.bank_name ?? "");
  const [accountNumber, setAccountNumber] = useState(defaults?.account_number ?? "");
  const [accountName, setAccountName] = useState(defaults?.account_name ?? "");
  const [busy, setBusy] = useState(false);

  const belowMin = availableBalance < 1000;

  const submit = async () => {
    const amt = Number(amount);
    if (!amt || amt < 1000) return toast.error("Minimum withdrawal is ₦1,000");
    if (amt > availableBalance) return toast.error("Amount exceeds available balance");
    if (!bank || !accountNumber.trim() || !accountName.trim())
      return toast.error("Fill in all bank details");
    setBusy(true);
    try {
      const { error } = await supabase.rpc("request_withdrawal" as never, {
        p_amount: amt,
        p_bank_name: bank,
        p_account_number: accountNumber.trim(),
        p_account_name: accountName.trim(),
      } as never);
      if (error) throw error;
      toast.success(`Withdrawal request of ${formatNgn(amt)} submitted. We'll process it within 24-48 hours.`);
      onOpenChange(false);
      setAmount("");
      onSuccess?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Withdrawal failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Withdraw funds</DialogTitle>
          <DialogDescription>
            Available: <span className="font-semibold text-foreground">{formatNgn(availableBalance)}</span>. Minimum ₦1,000.
          </DialogDescription>
        </DialogHeader>
        {belowMin ? (
          <div className="text-sm text-muted-foreground py-4">
            Minimum withdrawal is ₦1,000. Your available balance is {formatNgn(availableBalance)}.
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <Label htmlFor="amt">Amount (NGN)</Label>
              <Input id="amt" type="number" min={1000} max={availableBalance} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="1000" />
            </div>
            <div>
              <Label>Bank</Label>
              <Select value={bank} onValueChange={setBank}>
                <SelectTrigger><SelectValue placeholder="Select bank" /></SelectTrigger>
                <SelectContent>
                  {NIGERIAN_BANKS.map((b) => (<SelectItem key={b} value={b}>{b}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="an">Account number</Label>
              <Input id="an" inputMode="numeric" value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} placeholder="0123456789" />
            </div>
            <div>
              <Label htmlFor="anm">Account name</Label>
              <Input id="anm" value={accountName} onChange={(e) => setAccountName(e.target.value)} placeholder="John Doe" />
            </div>
            <Button onClick={submit} disabled={busy} className="w-full bg-gradient-brand">
              {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Submit request
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}