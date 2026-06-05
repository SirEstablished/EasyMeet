import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Star } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/providers";
import { toast } from "sonner";

export function ReviewOrderDialog({
  open,
  onOpenChange,
  providerId,
  providerName,
  onSubmitted,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  providerId: string;
  providerName: string;
  onSubmitted?: () => void;
}) {
  const { user } = useAuth();
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!user) return;
    if (rating < 1) {
      toast.error("Please select a star rating");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("reviews").insert({
      reviewer_id: user.id,
      professional_id: providerId,
      rating,
      comment: comment.trim() || null,
    });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Thank you for your review!");
    onSubmitted?.();
    onOpenChange(false);
    setRating(0);
    setComment("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Leave a review</DialogTitle>
          <DialogDescription>How was your experience with {providerName}?</DialogDescription>
        </DialogHeader>
        <div className="flex items-center justify-center gap-1 py-2">
          {[1, 2, 3, 4, 5].map((n) => {
            const active = (hover || rating) >= n;
            return (
              <button
                key={n}
                type="button"
                onMouseEnter={() => setHover(n)}
                onMouseLeave={() => setHover(0)}
                onClick={() => setRating(n)}
                className="p-1"
                aria-label={`${n} star${n > 1 ? "s" : ""}`}
              >
                <Star className={`h-7 w-7 ${active ? "fill-amber-400 text-amber-400" : "text-muted-foreground"}`} />
              </button>
            );
          })}
        </div>
        <Textarea
          rows={3}
          maxLength={300}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Share your experience (optional)"
        />
        <div className="text-right text-xs text-muted-foreground">{comment.length}/300</div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={saving} className="bg-gradient-brand">
            {saving ? "Submitting…" : "Submit review"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}