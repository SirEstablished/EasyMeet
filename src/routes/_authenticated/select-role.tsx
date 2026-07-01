import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/providers";
import { supabase, type AppRole } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";
import { User as UserIcon, Briefcase, Building2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/select-role")({
  component: SelectRole,
});

const options: { id: AppRole; label: string; desc: string; Icon: typeof UserIcon }[] = [
  { id: "customer", label: "Customer", desc: "I want to hire professionals", Icon: UserIcon },
  { id: "professional", label: "Professional", desc: "I offer services as an individual", Icon: Briefcase },
  { id: "business", label: "Business", desc: "I represent an organisation", Icon: Building2 },
];

function SelectRole() {
  const { user, profile, refreshProfile, loading } = useAuth();
  const navigate = useNavigate();
  const [role, setRole] = useState<AppRole | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!loading && profile?.role) {
      navigate({ to: "/dashboard" });
    }
  }, [loading, profile, navigate]);

  const save = async () => {
    if (!user || !role) return;
    setSaving(true);
    const full_name =
      (user.user_metadata?.full_name as string | undefined) ||
      (user.user_metadata?.name as string | undefined) ||
      user.email?.split("@")[0] ||
      "";
    const { error } = await supabase
      .from("profiles")
      .upsert(
        {
          id: user.id,
          full_name,
          role,
          email_notifications: true,
          in_app_notifications: true,
          sells_products: false,
          offers_services: role !== "customer",
        },
        { onConflict: "id" },
      );
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    await refreshProfile();
    toast.success("Welcome to EasyMeet! 🎉");
    navigate({ to: "/dashboard" });
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 sm:p-8 shadow-sm">
        <div className="flex justify-center mb-4">
          <Logo asLink={false} size="md" />
        </div>
        <h1 className="text-xl sm:text-2xl font-semibold text-center">Choose your role</h1>
        <p className="text-sm text-muted-foreground text-center mt-1">
          Tell us how you'll use EasyMeet so we can set things up.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-6">
          {options.map(({ id, label, desc, Icon }) => {
            const active = role === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setRole(id)}
                className={`text-left rounded-lg border p-3 transition-all hover:border-primary/60 ${
                  active ? "border-primary bg-primary/5 ring-2 ring-primary/40" : "border-border bg-card"
                }`}
              >
                <Icon className={`h-5 w-5 mb-1.5 ${active ? "text-primary" : "text-muted-foreground"}`} />
                <div className="text-sm font-semibold">{label}</div>
                <div className="text-xs text-muted-foreground leading-tight mt-0.5">{desc}</div>
              </button>
            );
          })}
        </div>
        <Button className="w-full mt-6" disabled={!role || saving} onClick={save}>
          {saving ? "Saving…" : "Continue"}
        </Button>
      </div>
    </div>
  );
}