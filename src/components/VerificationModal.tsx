import { useState, type ChangeEvent } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload, CheckCircle2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/providers";
import { payWithPaystack } from "@/lib/paystack";
import { toast } from "sonner";

type Tick = "blue" | "white";

export const TICK_PRICE_NGN: Record<Tick, number> = {
  blue: 2000,
  white: 5000,
};

export function VerificationModal({
  open,
  onOpenChange,
  tickType,
  onCompleted,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tickType: Tick;
  onCompleted?: () => void;
}) {
  const { user, profile, refreshProfile } = useAuth();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [uploading, setUploading] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);

  // Blue
  const [govIdUrl, setGovIdUrl] = useState<string | null>(null);
  const [selfieUrl, setSelfieUrl] = useState<string | null>(null);
  const [certUrl, setCertUrl] = useState<string | null>(null);
  const [phone, setPhone] = useState(profile?.phone ?? "");

  // White
  const [cacUrl, setCacUrl] = useState<string | null>(null);
  const [addressUrl, setAddressUrl] = useState<string | null>(null);
  const [ownerIdUrl, setOwnerIdUrl] = useState<string | null>(null);
  const [businessName, setBusinessName] = useState("");
  const [regNumber, setRegNumber] = useState("");
  const [businessPhone, setBusinessPhone] = useState("");

  const reset = () => {
    setStep(1);
    setGovIdUrl(null); setSelfieUrl(null); setCertUrl(null);
    setCacUrl(null); setAddressUrl(null); setOwnerIdUrl(null);
    setBusinessName(""); setRegNumber(""); setBusinessPhone("");
  };

  const uploadFile = async (
    e: ChangeEvent<HTMLInputElement>,
    key: string,
    setter: (url: string | null) => void,
  ) => {
    const f = e.target.files?.[0];
    if (!f || !user) return;
    setUploading(key);
    const ext = (f.name.split(".").pop() || "bin").toLowerCase();
    const path = `${user.id}/${tickType}-${key}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage
      .from("verification-docs")
      .upload(path, f, { upsert: true, contentType: f.type });
    if (error) {
      toast.error(error.message);
    } else {
      setter(path);
      toast.success("Uploaded");
    }
    setUploading(null);
  };

  const docsValid =
    tickType === "blue"
      ? !!govIdUrl && !!selfieUrl && phone.trim().length > 0
      : !!cacUrl && !!addressUrl && !!ownerIdUrl &&
        businessName.trim().length > 0 && regNumber.trim().length > 0 && businessPhone.trim().length > 0;

  const proceedToPayment = () => {
    if (!docsValid) {
      toast.error("Please upload all required documents");
      return;
    }
    setStep(2);
  };

  const pay = async () => {
    if (!user) return;
    setPaying(true);
    try {
      const amount = TICK_PRICE_NGN[tickType];
      const res = await payWithPaystack({
        email: user.email || `${user.id}@easymeet.app`,
        amountNgn: amount,
        metadata: { kind: "tick_verification", tick_type: tickType },
      });
      const document_urls =
        tickType === "blue"
          ? [govIdUrl, selfieUrl, certUrl].filter(Boolean) as string[]
          : [cacUrl, addressUrl, ownerIdUrl].filter(Boolean) as string[];

      const { error } = await supabase.from("verification_requests").insert({
        user_id: user.id,
        tick_type: tickType,
        document_urls,
        business_name: tickType === "white" ? businessName : null,
        registration_number: tickType === "white" ? regNumber : null,
      });
      if (error) throw error;

      // Record payment + provisionally activate tick (subject to review)
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      await Promise.all([
        supabase.from("tick_purchases").insert({
          user_id: user.id,
          tick_type: tickType,
          amount_paid: amount,
          payment_ref: res.reference,
          expires_at: expiresAt,
        }),
        supabase
          .from("profiles")
          .update(tickType === "blue" ? { blue_tick: true, phone } : { white_tick: true, phone: businessPhone })
          .eq("id", user.id),
      ]);
      await refreshProfile();
      setStep(3);
      onCompleted?.();
    } catch (e) {
      if (e instanceof Error && e.message === "Payment cancelled") {
        toast.message("Payment cancelled");
      } else {
        toast.error(e instanceof Error ? e.message : "Something went wrong");
      }
    } finally {
      setPaying(false);
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
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {tickType === "blue" ? "Get Blue Tick (Professional)" : "Get White Tick (Business)"}
          </DialogTitle>
          <DialogDescription>
            Step {step} of 3 — {step === 1 ? "Upload documents" : step === 2 ? "Payment" : "Confirmation"}
          </DialogDescription>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-4">
            {tickType === "blue" ? (
              <>
                <DocField label="Government issued ID (NIN / Voter's card / Driver's license / Passport)" required
                  uploaded={!!govIdUrl} loading={uploading === "gov"}
                  onChange={(e) => uploadFile(e, "gov", setGovIdUrl)} />
                <DocField label="Selfie photo matching the ID" required image
                  uploaded={!!selfieUrl} loading={uploading === "selfie"}
                  onChange={(e) => uploadFile(e, "selfie", setSelfieUrl)} />
                <div className="space-y-1.5">
                  <Label>Phone number (confirm)</Label>
                  <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+234..." />
                </div>
                <DocField label="Professional certificate (optional)"
                  uploaded={!!certUrl} loading={uploading === "cert"}
                  onChange={(e) => uploadFile(e, "cert", setCertUrl)} />
              </>
            ) : (
              <>
                <DocField label="CAC registration document" required
                  uploaded={!!cacUrl} loading={uploading === "cac"}
                  onChange={(e) => uploadFile(e, "cac", setCacUrl)} />
                <div className="grid sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Business name</Label>
                    <Input value={businessName} onChange={(e) => setBusinessName(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Registration number</Label>
                    <Input value={regNumber} onChange={(e) => setRegNumber(e.target.value)} />
                  </div>
                </div>
                <DocField label="Business address proof" required
                  uploaded={!!addressUrl} loading={uploading === "addr"}
                  onChange={(e) => uploadFile(e, "addr", setAddressUrl)} />
                <DocField label="Owner's government ID" required
                  uploaded={!!ownerIdUrl} loading={uploading === "ownerid"}
                  onChange={(e) => uploadFile(e, "ownerid", setOwnerIdUrl)} />
                <div className="space-y-1.5">
                  <Label>Business phone number</Label>
                  <Input value={businessPhone} onChange={(e) => setBusinessPhone(e.target.value)} placeholder="+234..." />
                </div>
              </>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button className="bg-gradient-brand" disabled={!docsValid} onClick={proceedToPayment}>
                Continue to payment
              </Button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div className="rounded-xl border border-border p-4">
              <div className="text-sm text-muted-foreground">Amount due</div>
              <div className="text-2xl font-bold text-primary mt-1">
                ₦{TICK_PRICE_NGN[tickType].toLocaleString()}/month
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Payment is processed securely via Paystack.
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
              <Button className="bg-gradient-brand" disabled={paying} onClick={pay}>
                {paying && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Pay ₦{TICK_PRICE_NGN[tickType].toLocaleString()}
              </Button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="text-center py-6 space-y-3">
            <CheckCircle2 className="h-12 w-12 text-accent mx-auto" />
            <h3 className="font-semibold text-lg">Submitted for review</h3>
            <p className="text-sm text-muted-foreground">
              Your documents have been submitted for review. You will be notified within 24–48 hours.
            </p>
            <Button className="bg-gradient-brand" onClick={() => onOpenChange(false)}>Done</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function DocField({
  label,
  required,
  uploaded,
  loading,
  image,
  onChange,
}: {
  label: string;
  required?: boolean;
  uploaded: boolean;
  loading: boolean;
  image?: boolean;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label>
        {label} {required && <span className="text-destructive">*</span>}
      </Label>
      <label className="flex items-center gap-2 cursor-pointer rounded-md border border-dashed border-border px-3 py-2 text-sm hover:bg-secondary">
        {uploaded ? <CheckCircle2 className="h-4 w-4 text-accent" /> : <Upload className="h-4 w-4" />}
        <span>
          {loading ? "Uploading…" : uploaded ? "Uploaded — replace" : "Choose file"}
        </span>
        <input
          type="file"
          accept={image ? "image/*" : "image/*,application/pdf"}
          className="hidden"
          onChange={onChange}
        />
      </label>
    </div>
  );
}