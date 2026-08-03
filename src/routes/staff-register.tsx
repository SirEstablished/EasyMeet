import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { payWithFlutterwave } from "@/lib/flutterwave";
import { verifyFlutterwavePayment } from "@/lib/flutterwave.functions";

export const Route = createFileRoute("/staff-register")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>) => ({
    invite: typeof search.invite === "string" ? search.invite : "",
  }),
  component: StaffRegisterPage,
});

interface InviteRow {
  id: string;
  business_id: string;
  full_name: string;
  email: string;
  commission_pct: number;
  status: string;
  expires_at: string;
}

function StaffRegisterPage() {
  const { invite } = Route.useSearch();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inviteRow, setInviteRow] = useState<InviteRow | null>(null);
  const [businessName, setBusinessName] = useState("");

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [idFile, setIdFile] = useState<File | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      if (!invite) {
        setError("Missing invite code.");
        setLoading(false);
        return;
      }
      const { data, error: e } = await supabase.rpc("get_staff_invite_by_code", {
        p_code: invite,
      });
      const row = (Array.isArray(data) ? data[0] : data) as
        | (InviteRow & { business_name: string | null })
        | null;
      if (e || !row) {
        setError("Invalid invite link.");
        setLoading(false);
        return;
      }
      if (row.status !== "pending") {
        setError("This invite has already been used or revoked.");
        setLoading(false);
        return;
      }
      if (new Date(row.expires_at).getTime() < Date.now()) {
        setError("This invite link has expired.");
        setLoading(false);
        return;
      }
      setInviteRow(row);
      setFullName(row.full_name);
      setBusinessName(row.business_name || "your business");
      setLoading(false);
    })();
  }, [invite]);

  const submit = async () => {
    if (!inviteRow) return;
    if (!fullName.trim() || !phone.trim() || password.length < 8) {
      toast.error("Fill in your details (password ≥ 8 chars).");
      return;
    }
    if (!idFile) {
      toast.error("Upload a government ID for KYC.");
      return;
    }
    if (!agreed) {
      toast.error("You must accept the agreement.");
      return;
    }
    setSubmitting(true);
    try {
      // 1. Sign up
      const { data: signUp, error: suErr } = await supabase.auth.signUp({
        email: inviteRow.email,
        password,
        options: {
          data: {
            full_name: fullName.trim(),
            role: "professional",
          },
          emailRedirectTo: `${window.location.origin}/dashboard`,
        },
      });
      if (suErr) throw suErr;
      const userId = signUp.user?.id;
      if (!userId) throw new Error("Sign-up failed");

      // 2. Upload KYC file
      const ext = idFile.name.split(".").pop() || "jpg";
      const path = `${userId}/id.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("staff-kyc")
        .upload(path, idFile, { upsert: true });
      if (upErr) throw upErr;

      // 3. Pay subscription
      const payRes = await payWithFlutterwave({
        email: inviteRow.email,
        amountNgn: 1000,
        flow: "staff",
        userId,
        description: "EasyMeet staff subscription",
        metadata: { kind: "staff_subscription", staff_id: userId },
      });
      const verify = await verifyFlutterwavePayment({
        data: { transactionId: payRes.transactionId, expectedAmountNgn: 1000 },
      });
      if (!verify.verified) {
        throw new Error(verify.message || "Payment could not be verified");
      }

      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      // 4. Update profile + insert subscription + mark invite accepted
      const { error: profErr } = await supabase
        .from("profiles")
        .update({
          full_name: fullName.trim(),
          phone: phone.trim(),
          bio: `Staff @ ${businessName}`,
          is_staff: true,
          staff_business_id: inviteRow.business_id,
          staff_commission_pct: inviteRow.commission_pct,
          white_tick: true,
          staff_subscription_active: true,
          staff_subscription_expires_at: expiresAt.toISOString(),
          role: "professional",
        })
        .eq("id", userId);
      if (profErr) throw profErr;

      await supabase.from("staff_subscriptions").insert({
        staff_id: userId,
        paystack_ref: payRes.reference,
        amount: 1000,
        expires_at: expiresAt.toISOString(),
      });

      await supabase
        .from("staff_invites")
        .update({ status: "accepted", accepted_by: userId })
        .eq("id", inviteRow.id);

      toast.success("Welcome! Your staff account is active.");
      navigate({ to: "/dashboard" });
    } catch (e: any) {
      toast.error(e?.message || "Registration failed");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        Loading invite…
      </div>
    );
  }
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-bold mb-2">Invite unavailable</h1>
          <p className="text-muted-foreground">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background py-10">
      <div className="max-w-lg mx-auto px-4">
        <div className="rounded-2xl border bg-card p-6 shadow-sm space-y-4">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              Staff registration
            </div>
            <h1 className="text-2xl font-bold mt-1">
              Join {businessName} on EasyMeet
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Commission: {inviteRow?.commission_pct}% · Email:{" "}
              {inviteRow?.email}
            </p>
          </div>

          <div>
            <Label>Full name</Label>
            <Input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </div>
          <div>
            <Label>Phone number</Label>
            <Input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
          <div>
            <Label>Password</Label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div>
            <Label>Government ID (KYC)</Label>
            <Input
              type="file"
              accept="image/*,.pdf"
              onChange={(e) => setIdFile(e.target.files?.[0] ?? null)}
            />
          </div>

          <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground space-y-1">
            <p className="font-semibold text-foreground">Agreement terms</p>
            <ul className="list-disc pl-4 space-y-1">
              <li>You represent {businessName} on EasyMeet.</li>
              <li>
                You cannot change product or service prices set by the business.
              </li>
              <li>
                A ₦1,000/month subscription is required to keep your staff
                account active. If it lapses, the account is deactivated.
              </li>
              <li>
                Your government ID is used for KYC verification only.
              </li>
            </ul>
          </div>

          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-1"
            />
            <span>I have read and accept the agreement terms above.</span>
          </label>

          <Button
            onClick={submit}
            disabled={submitting}
            className="w-full"
          >
            {submitting
              ? "Processing…"
              : "Register & pay ₦1,000 subscription"}
          </Button>
        </div>
      </div>
    </div>
  );
}