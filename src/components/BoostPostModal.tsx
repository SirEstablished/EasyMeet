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
import { payWithPaystack } from "@/lib/paystack";
import { verifyPaystackTransaction } from "@/lib/paystack.functions";
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

  const boost = async () => {
    if (!user) return;
    if (!postId) {
      toast.info("Boost a post from the post menu in the feed");
      onOpenChange(false);
      return;
    }
    setPaying(true);
    try {
      const res = await payWithPaystack({
        email: user.email || `${user.id}@easymeet.app`,
        amountNgn: 2000,
        metadata: { post_id: postId, kind: "boost" },
      });
      const verify = await verifyPaystackTransaction({
        data: { reference: res.reference, expectedAmountNgn: 2000 },
      });
      if (!verify.ok) {
        toast.error(verify.message || "Payment could not be verified");
        return;
      }
      const endAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const [{ error: bErr }, { error: pErr }] = await Promise.all([
        supabase.from("boosts").insert({
          post_id: postId,
          user_id: user.id,
          amount_paid: 2000,
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
        <div className="rounded-xl border border-border bg-secondary/50 p-4 text-center">
          <div className="text-2xl font-bold text-primary">₦2,000</div>
          <div className="text-xs text-muted-foreground">for 7 days at the top of the feed</div>
        </div>
        <DialogFooter className="sm:justify-center gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Maybe later
          </Button>
          <Button className="bg-gradient-brand" onClick={boost} disabled={paying || !postId}>
            {paying && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Boost Now
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}