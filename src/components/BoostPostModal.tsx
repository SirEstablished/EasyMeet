import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Rocket } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import { payWithFlutterwave } from "@/lib/flutterwave";
import { verifyFlutterwavePayment } from "@/lib/flutterwave.functions";
import { computeGatewayFee } from "@/lib/fees";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/providers";

export function BoostPostModal({
  open,
  onOpenChange,
  postId,
  onBoosted,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  postId?: string | null;
  onBoosted?: (postId: string, boostUntil: string) => void;
}) {
  const { user } = useAuth();
  const [paying, setPaying] = useState(false);
  const BOOST_AMOUNT = 2000;
  const protectionFee = computeGatewayFee(BOOST_AMOUNT);
  const total = BOOST_AMOUNT + protectionFee;

  const boost = async () => {
    if (!user) return;
    if (!postId) {
      toast.info("Boost a post from the post menu in the feed");
      onOpenChange(false);
      return;
    }
    setPaying(true);
    try {
      const res = await payWithFlutterwave({
        email: user.email || `${user.id}@easymeet.app`,
        amountNgn: total,
        flow: "boost",
        userId: user.id,
        description: "EasyMeet post boost (7 days)",
        metadata: { post_id: postId, kind: "boost" },
      });
      const verify = await verifyFlutterwavePayment({
        data: { transactionId: res.transactionId, expectedAmountNgn: total },
      });
      if (!verify.verified) {
        toast.error(verify.message || "Payment could not be verified");
        return;
      }
      const endAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const [{ error: bErr }, { error: pErr }] = await Promise.all([
        supabase.from("boosts").insert({
          post_id: postId,
          user_id: user.id,
          amount_paid: BOOST_AMOUNT,
          end_at: endAt,
          payment_ref: res.reference,
        }),
        supabase.from("posts").update({ is_boosted: true, boost_until: endAt }).eq("id", postId),
      ]);
      if (bErr || pErr) throw bErr || pErr;
      toast.success("Your post is now boosted for 7 days!");
      onBoosted?.(postId, endAt);
      onOpenChange(false);
    } catch (e) {
      if (e instanceof Error && e.message === "Payment cancelled") {
        toast.message("Payment cancelled");
      } else {
        toast.error(e instanceof Error ? e.message : "Boost failed");
      }
    } finally {
      setPaying(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <div className="mx-auto h-12 w-12 rounded-full bg-gradient-brand flex items-center justify-center mb-2">
            <Rocket className="h-6 w-6 text-white" />
          </div>
          <DialogTitle className="text-center">Boost this post</DialogTitle>
          <DialogDescription className="text-center">
            Reach more customers — boost your post to the top of the feed.
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-xl border border-border bg-secondary/50 p-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Boost (7 days)</span>
            <span>₦{BOOST_AMOUNT.toLocaleString()}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">🛡️ EasyMeet Protection Fee</span>
            <span>₦{protectionFee.toLocaleString()}</span>
          </div>
          <div className="flex justify-between font-semibold pt-2 border-t border-border">
            <span>Total</span>
            <span className="text-primary">₦{total.toLocaleString()}</span>
          </div>
        </div>
        <DialogFooter className="sm:justify-center gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Maybe later
          </Button>
          <Button className="bg-gradient-brand" onClick={boost} disabled={paying || !postId}>
            {paying && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Pay ₦{total.toLocaleString()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}