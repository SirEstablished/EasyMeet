import { useMemo, useState } from "react";
import { supabase, formatNgn } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, ShieldCheck } from "lucide-react";
import { computeGatewayFee, NIGERIAN_BANKS } from "@/lib/fees";

const ADMIN_USER_ID = "18f810c2-762f-4d66-93a2-48b1be211c8c";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  orderId: string;
  escrowId: string;
  amount: number;
  serviceTitle: string;
  customerName: string;
  onSubmitted?: () => void;
}

export function RequestRefundDialog({
  open,
  onOpenChange,
  orderId,
  escrowId,
  amount,
  serviceTitle,
  customerName,
  onSubmitted,
}: Props) {
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const processingFee = useMemo(() => computeGatewayFee(amount), [amount]);
  const refundAmount = Math.max(0, Math.round((amount - processingFee) * 100) / 100);

  const valid =
    bankName.trim().length > 0 &&
    /^\d{10}$/.test(accountNumber.trim()) &&
    accountName.trim().length >= 2;

  const reset = () => {
    setBankName("");
    setAccountNumber("");
    setAccountName("");
    setDone(false);
    setSubmitting(false);
  };

  const submit = async () => {
    if (!valid) return;
    setSubmitting(true);
    try {
      const { error: escrowErr } = await supabase
        .from("escrow")
        .update({
          refund_status: "requested",
          refund_amount: refundAmount,
          refund_fee: processingFee,
        } as never)
        .eq("id", escrowId);
      if (escrowErr) throw escrowErr;

      // Best-effort — status column is not blocked by financial guard.
      await supabase
        .from("orders")
        .update({ status: "refund_requested" } as never)
        .eq("id", orderId);

      const adminMsg =
        `Customer ${customerName} has requested a refund of ${formatNgn(refundAmount)} ` +
        `for order "${serviceTitle}". Bank: ${bankName} · Acct: ${accountNumber} · ` +
        `Name: ${accountName} · Escrow: ${escrowId}`;

      const { error: notifErr } = await supabase.from("notifications").insert({
        user_id: ADMIN_USER_ID,
        title: "Refund Requested 💰",
        message: adminMsg,
        type: "refund_request",
      } as never);
      if (notifErr) console.error("Admin notification failed", notifErr);

      setDone(true);
      onSubmitted?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not submit refund request");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) setTimeout(reset, 200);
      }}
    >
      <DialogContent className="max-w-md">
        {done ? (
          <>
            <DialogHeader>
              <div className="mx-auto h-12 w-12 rounded-full bg-gradient-brand flex items-center justify-center mb-2">
                <ShieldCheck className="h-6 w-6 text-white" />
              </div>
              <DialogTitle className="text-center">Refund request received</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground text-center">
              Your refund of <span className="font-semibold text-foreground">{formatNgn(refundAmount)}</span> is being
              processed. Please note that the non-refundable payment processing fee ({formatNgn(processingFee)}) will be
              deducted from your refund. EasyMeet does not charge any fee on refunds. Refunds take 3–5 business days.
            </p>
            <DialogFooter className="sm:justify-center">
              <Button className="bg-gradient-brand" onClick={() => onOpenChange(false)}>
                Done
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Request Refund</DialogTitle>
              <DialogDescription>
                Enter the bank account we should send your refund to.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Bank Name</Label>
                <Select value={bankName} onValueChange={setBankName}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select your bank" />
                  </SelectTrigger>
                  <SelectContent>
                    {NIGERIAN_BANKS.map((b) => (
                      <SelectItem key={b} value={b}>
                        {b}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Account Number</Label>
                <Input
                  inputMode="numeric"
                  maxLength={10}
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, "").slice(0, 10))}
                  placeholder="10-digit account number"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Account Name</Label>
                <Input
                  value={accountName}
                  onChange={(e) => setAccountName(e.target.value)}
                  placeholder="As it appears on the account"
                />
              </div>

              <div className="rounded-xl border border-border bg-secondary/40 p-3 text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Amount paid</span>
                  <span>{formatNgn(amount)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Processing fee</span>
                  <span>− {formatNgn(processingFee)}</span>
                </div>
                <div className="flex justify-between font-semibold pt-1 border-t border-border">
                  <span>You'll receive</span>
                  <span className="text-primary">{formatNgn(refundAmount)}</span>
                </div>
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
                Cancel
              </Button>
              <Button className="bg-gradient-brand" disabled={!valid || submitting} onClick={submit}>
                {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Confirm
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}