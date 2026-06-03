import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Rocket } from "lucide-react";
import { toast } from "sonner";

export function BoostPostModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
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
          <Button
            className="bg-gradient-brand"
            onClick={() => {
              toast.info("Payments coming soon", {
                description: "Pay to Push will be wired up in Phase 6.",
              });
              onOpenChange(false);
            }}
          >
            Boost Now
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}