import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/providers";
import { supabase, type Profile } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Copy, UserPlus, Trash2 } from "lucide-react";
import { useLiveData } from "@/hooks/use-live-data";

export const Route = createFileRoute("/_authenticated/staffs")({
  component: StaffsPage,
});

interface StaffInvite {
  id: string;
  full_name: string;
  email: string;
  commission_pct: number;
  invite_code: string;
  status: string;
  expires_at: string;
  created_at: string;
}

function generateCode() {
  return (
    Math.random().toString(36).slice(2, 10) +
    Math.random().toString(36).slice(2, 10)
  ).toUpperCase();
}

function inviteUrl(code: string) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/staff-register?invite=${code}`;
}

function StaffsPage() {
  const { user, profile } = useAuth();
  const [invites, setInvites] = useState<StaffInvite[]>([]);
  const [staff, setStaff] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [commission, setCommission] = useState("10");
  const [submitting, setSubmitting] = useState(false);

  const isBusiness = profile?.role === "business";

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const [{ data: inv }, { data: st }] = [
      await supabase
        .from("staff_invites")
        .select("*")
        .eq("business_id", user.id)
        .order("created_at", { ascending: false }),
      await supabase
        .from("profiles")
        .select("*")
        .eq("staff_business_id", user.id),
    ];
    setInvites((inv as StaffInvite[]) ?? []);
    setStaff((st as Profile[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useLiveData(user ? ["staff_invites", "profiles"] : [], load);

  if (!isBusiness) {
    return (
      <div className="max-w-3xl mx-auto p-8">
        <h1 className="text-2xl font-bold mb-2">Staff Management</h1>
        <p className="text-muted-foreground">
          Only business accounts can manage staff.
        </p>
      </div>
    );
  }

  const submit = async () => {
    if (!user) return;
    if (!fullName.trim() || !email.trim()) {
      toast.error("Enter the staff name and email");
      return;
    }
    const pct = Number(commission);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      toast.error("Commission must be 0–100");
      return;
    }
    setSubmitting(true);
    const code = generateCode();
    const expires = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from("staff_invites")
      .insert({
        business_id: user.id,
        full_name: fullName.trim(),
        email: email.trim().toLowerCase(),
        commission_pct: pct,
        invite_code: code,
        expires_at: expires,
        status: "pending",
      })
      .select("*")
      .single();
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    const url = inviteUrl(code);
    const subject = `You're invited to join ${profile?.full_name || "our business"} on EasyMeet`;
    const body = `Hi ${fullName},\n\n${profile?.full_name || "We"} have invited you to join as a staff member on EasyMeet.\n\nYour commission: ${pct}%\nRegistration link (expires in 48 hours):\n${url}\n\nAgreement terms:\n- You represent ${profile?.full_name || "the business"} on EasyMeet.\n- You cannot change prices set by the business.\n- A monthly subscription of NGN 1,000 keeps your staff account active.\n\nWelcome aboard!`;
    window.open(
      `mailto:${encodeURIComponent(email.trim())}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`,
      "_blank",
    );
    toast.success("Invite created. Email draft opened.");
    setFullName("");
    setEmail("");
    setCommission("10");
    setOpen(false);
    setInvites((prev) => [data as StaffInvite, ...prev]);
  };

  const copyLink = (code: string) => {
    navigator.clipboard.writeText(inviteUrl(code));
    toast.success("Invite link copied");
  };

  const revokeInvite = async (id: string) => {
    const { error } = await supabase
      .from("staff_invites")
      .update({ status: "revoked" })
      .eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Invite revoked");
    load();
  };

  const removeStaff = async (id: string) => {
    if (!confirm("Remove this staff member?")) return;
    const { error } = await supabase
      .from("profiles")
      .update({
        is_staff: false,
        staff_business_id: null,
        staff_commission_pct: null,
        white_tick: false,
      })
      .eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Staff removed");
    load();
  };

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Staff</h1>
          <p className="text-muted-foreground">
            Invite team members to sell under your business.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <UserPlus className="h-4 w-4 mr-2" /> Add Staff
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Invite a staff member</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Full name</Label>
                <Input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                />
              </div>
              <div>
                <Label>Email</Label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div>
                <Label>Commission %</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={commission}
                  onChange={(e) => setCommission(e.target.value)}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Agreement: staff cannot change prices and represent your business.
                The invite link expires in 48 hours.
              </p>
            </div>
            <DialogFooter>
              <Button onClick={submit} disabled={submitting}>
                {submitting ? "Sending…" : "Submit & email invite"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <section>
        <h2 className="font-semibold mb-2">Active staff</h2>
        {loading ? (
          <p className="text-muted-foreground">Loading…</p>
        ) : staff.length === 0 ? (
          <p className="text-muted-foreground text-sm">No active staff yet.</p>
        ) : (
          <div className="rounded-xl border divide-y">
            {staff.map((s) => (
              <div
                key={s.id}
                className="p-3 flex items-center justify-between gap-3"
              >
                <div>
                  <div className="font-medium">{s.full_name || "Unnamed"}</div>
                  <div className="text-xs text-muted-foreground">
                    Commission: {s.staff_commission_pct ?? 0}% ·{" "}
                    {s.staff_subscription_active
                      ? "Active subscription"
                      : "Subscription inactive"}
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => removeStaff(s.id)}
                >
                  <Trash2 className="h-4 w-4 mr-1" /> Remove
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="font-semibold mb-2">Pending invites</h2>
        {invites.filter((i) => i.status === "pending").length === 0 ? (
          <p className="text-muted-foreground text-sm">No pending invites.</p>
        ) : (
          <div className="rounded-xl border divide-y">
            {invites
              .filter((i) => i.status === "pending")
              .map((i) => {
                const expired = new Date(i.expires_at).getTime() < Date.now();
                return (
                  <div
                    key={i.id}
                    className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div>
                      <div className="font-medium">{i.full_name}</div>
                      <div className="text-xs text-muted-foreground">
                        {i.email} · {i.commission_pct}% ·{" "}
                        {expired ? (
                          <span className="text-destructive">Expired</span>
                        ) : (
                          `Expires ${new Date(i.expires_at).toLocaleString()}`
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => copyLink(i.invite_code)}
                      >
                        <Copy className="h-4 w-4 mr-1" /> Copy link
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => revokeInvite(i.id)}
                      >
                        Revoke
                      </Button>
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </section>
    </div>
  );
}