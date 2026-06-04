import { useState, type FormEvent } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";
import { useAuthModal } from "@/lib/providers";
import {
  supabase,
  type AppRole,
  PROFESSIONS,
  BUSINESS_TYPES,
} from "@/integrations/supabase/client";
import { User as UserIcon, Briefcase, Building2 } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type BusinessMode = "products" | "services" | "both";

const roleOptions: {
  id: AppRole;
  label: string;
  description: string;
  Icon: typeof UserIcon;
}[] = [
  { id: "customer", label: "Customer", description: "I want to hire professionals", Icon: UserIcon },
  { id: "professional", label: "Professional", description: "I offer services as an individual", Icon: Briefcase },
  { id: "business", label: "Business", description: "I represent an organisation", Icon: Building2 },
];

export function AuthModal() {
  const { open, mode, close, setMode } = useAuthModal();
  const navigate = useNavigate();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<AppRole | null>(null);
  const [step, setStep] = useState<1 | 2>(1);
  const [profession, setProfession] = useState<string>("");
  const [professionOther, setProfessionOther] = useState("");
  const [sellsProducts, setSellsProducts] = useState(false);
  const [businessType, setBusinessType] = useState<string>("");
  const [businessTypeOther, setBusinessTypeOther] = useState("");
  const [businessMode, setBusinessMode] = useState<BusinessMode | "">("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const reset = () => {
    setError(null);
    setInfo(null);
  };

  const goToStep2 = (e: FormEvent) => {
    e.preventDefault();
    reset();
    if (!role) {
      setError("Please select a role.");
      return;
    }
    if (role === "customer") {
      void handleSignup();
      return;
    }
    setStep(2);
  };

  const handleSignup = async (e?: FormEvent) => {
    e?.preventDefault();
    reset();
    if (!role) {
      setError("Please select a role.");
      return;
    }
    let professionValue: string | null = null;
    let businessTypeValue: string | null = null;
    let sellsProductsValue = false;
    let offersServicesValue = true;
    if (role === "professional") {
      if (!profession) {
        setError("Please select your profession.");
        return;
      }
      professionValue = profession === "Other" ? professionOther.trim() : profession;
      if (!professionValue) {
        setError("Please describe your profession.");
        return;
      }
      sellsProductsValue = sellsProducts;
      offersServicesValue = true;
    } else if (role === "business") {
      if (!businessType) {
        setError("Please select your business type.");
        return;
      }
      businessTypeValue = businessType === "Other" ? businessTypeOther.trim() : businessType;
      if (!businessTypeValue) {
        setError("Please describe your business type.");
        return;
      }
      if (!businessMode) {
        setError("Please tell us what your business does.");
        return;
      }
      sellsProductsValue = businessMode === "products" || businessMode === "both";
      offersServicesValue = businessMode === "services" || businessMode === "both";
    } else {
      sellsProductsValue = false;
      offersServicesValue = false;
    }
    setLoading(true);
    const { data, error: err } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/dashboard`,
        data: {
          full_name: fullName,
          role,
          profession: professionValue,
          business_type: businessTypeValue,
          sells_products: sellsProductsValue,
          offers_services: offersServicesValue,
        },
      },
    });
    if (err) {
      setLoading(false);
      if (err.message.toLowerCase().includes("registered")) {
        setError("An account with this email already exists.");
      } else {
        setError(err.message);
      }
      return;
    }

    // Only writable when a session exists (RLS). For email-confirm flows
    // the values live in user_metadata and are backfilled on first login
    // by AuthProvider.loadProfile.
    if (data.user && data.session) {
      const payload = {
        id: data.user.id,
        full_name: fullName,
        role,
        email_notifications: true,
        in_app_notifications: true,
        profession: professionValue,
        business_type: businessTypeValue,
        sells_products: sellsProductsValue,
        offers_services: offersServicesValue,
      };
      const { error: upsertErr } = await supabase
        .from("profiles")
        .upsert(payload, { onConflict: "id" });
      if (upsertErr) {
        // Fall back to a targeted update in case a trigger pre-created the row
        await supabase
          .from("profiles")
          .update({
            full_name: fullName,
            role,
            profession: professionValue,
            business_type: businessTypeValue,
            sells_products: sellsProductsValue,
            offers_services: offersServicesValue,
          })
          .eq("id", data.user.id);
      }
    }

    setLoading(false);

    if (data.session) {
      close();
      navigate({ to: "/dashboard" });
    } else {
      setInfo("Check your email to confirm your account, then sign in.");
      setMode("login");
      setStep(1);
    }
  };

  const _legacyHandleSignup = async (e: FormEvent) => {
    e.preventDefault();
    reset();
    if (!role) {
      setError("Please select a role.");
      return;
    }
    setLoading(true);
    const { data, error: err } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/dashboard`,
        data: { full_name: fullName, role },
      },
    });
    if (err) {
      setLoading(false);
      if (err.message.toLowerCase().includes("registered")) {
        setError("An account with this email already exists.");
      } else {
        setError(err.message);
      }
      return;
    }

    // Create profile row (works whether or not a DB trigger exists)
    if (data.user) {
      await supabase.from("profiles").upsert(
        {
          id: data.user.id,
          full_name: fullName,
          role,
          email_notifications: true,
          in_app_notifications: true,
        },
        { onConflict: "id" },
      );
    }

    setLoading(false);

    if (data.session) {
      close();
      navigate({ to: "/dashboard" });
    } else {
      setInfo("Check your email to confirm your account, then sign in.");
      setMode("login");
    }
  };

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    reset();
    setLoading(true);
    const { error: err } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setLoading(false);
    if (err) {
      const m = err.message.toLowerCase();
      if (m.includes("invalid")) setError("Wrong email or password.");
      else if (m.includes("confirm")) setError("Please verify your email first.");
      else setError(err.message);
      return;
    }
    close();
    navigate({ to: "/dashboard" });
  };

  const handleForgot = async () => {
    reset();
    if (!email) {
      setError("Enter your email above first.");
      return;
    }
    setLoading(true);
    const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (err) setError(err.message);
    else setInfo("Password reset link sent. Check your inbox.");
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? null : close())}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex justify-center mb-2">
            <Logo asLink={false} size="md" />
          </div>
          <DialogTitle className="text-center">
            {mode === "signup" ? "Create your account" : "Welcome back"}
          </DialogTitle>
          <DialogDescription className="text-center">
            {mode === "signup"
              ? "Join Nigeria's trusted service marketplace."
              : "Sign in to continue to EasyMeet."}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="text-sm rounded-md bg-destructive/10 text-destructive px-3 py-2">
            {error}
          </div>
        )}
        {info && (
          <div className="text-sm rounded-md bg-accent/10 text-accent-foreground px-3 py-2">
            {info}
          </div>
        )}

        {mode === "signup" ? (
          step === 1 ? (
          <form onSubmit={goToStep2} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="fullName">Full name</Label>
              <Input
                id="fullName"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Ada Okeke"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@email.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>I am a…</Label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {roleOptions.map(({ id, label, description, Icon }) => {
                  const active = role === id;
                  return (
                    <button
                      type="button"
                      key={id}
                      onClick={() => setRole(id)}
                      className={`text-left rounded-lg border p-3 transition-all hover:border-primary/60 ${
                        active
                          ? "border-primary bg-primary/5 ring-2 ring-primary/40"
                          : "border-border bg-card"
                      }`}
                    >
                      <Icon className={`h-5 w-5 mb-1.5 ${active ? "text-primary" : "text-muted-foreground"}`} />
                      <div className="text-sm font-semibold">{label}</div>
                      <div className="text-xs text-muted-foreground leading-tight mt-0.5">
                        {description}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Creating account…" : role === "customer" ? "Create account" : "Continue"}
            </Button>

            <p className="text-sm text-center text-muted-foreground">
              Already have an account?{" "}
              <button
                type="button"
                className="text-primary font-medium hover:underline"
                onClick={() => {
                  reset();
                  setMode("login");
                }}
              >
                Sign in
              </button>
            </p>
          </form>
          ) : (
          <form onSubmit={handleSignup} className="space-y-4">
            {role === "professional" && (
              <>
                <div className="space-y-1.5">
                  <Label>What is your profession?</Label>
                  <Select value={profession} onValueChange={setProfession}>
                    <SelectTrigger><SelectValue placeholder="Select your profession" /></SelectTrigger>
                    <SelectContent>
                      {PROFESSIONS.map((p) => (
                        <SelectItem key={p} value={p}>{p}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {profession === "Other" && (
                    <Input
                      className="mt-2"
                      placeholder="Tell us your profession"
                      value={professionOther}
                      onChange={(e) => setProfessionOther(e.target.value)}
                    />
                  )}
                </div>
                <div className="flex items-center justify-between rounded-lg border border-border p-3">
                  <div>
                    <div className="text-sm font-medium">Do you sell physical or digital products?</div>
                    <div className="text-xs text-muted-foreground">Enables the marketplace for your account.</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSellsProducts((v) => !v)}
                    className={`h-6 w-11 rounded-full transition-colors relative ${sellsProducts ? "bg-primary" : "bg-muted"}`}
                    aria-pressed={sellsProducts}
                  >
                    <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${sellsProducts ? "left-5" : "left-0.5"}`} />
                  </button>
                </div>
              </>
            )}
            {role === "business" && (
              <>
                <div className="space-y-1.5">
                  <Label>What type of business?</Label>
                  <Select value={businessType} onValueChange={setBusinessType}>
                    <SelectTrigger><SelectValue placeholder="Select business type" /></SelectTrigger>
                    <SelectContent>
                      {BUSINESS_TYPES.map((b) => (
                        <SelectItem key={b} value={b}>{b}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {businessType === "Other" && (
                    <Input
                      className="mt-2"
                      placeholder="Describe your business type"
                      value={businessTypeOther}
                      onChange={(e) => setBusinessTypeOther(e.target.value)}
                    />
                  )}
                </div>
                <div className="space-y-2">
                  <Label>What does your business do?</Label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {([
                      { id: "products", label: "We sell products", desc: "Physical or digital" },
                      { id: "services", label: "We offer services", desc: "Skills and time" },
                      { id: "both", label: "Both", desc: "Products + services" },
                    ] as { id: BusinessMode; label: string; desc: string }[]).map((o) => {
                      const active = businessMode === o.id;
                      return (
                        <button
                          type="button"
                          key={o.id}
                          onClick={() => setBusinessMode(o.id)}
                          className={`text-left rounded-lg border p-3 transition-all hover:border-primary/60 ${
                            active
                              ? "border-primary bg-primary/5 ring-2 ring-primary/40"
                              : "border-border bg-card"
                          }`}
                        >
                          <div className="text-sm font-semibold">{o.label}</div>
                          <div className="text-xs text-muted-foreground leading-tight mt-0.5">{o.desc}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => { setStep(1); reset(); }}>
                Back
              </Button>
              <Button type="submit" className="flex-1" disabled={loading}>
                {loading ? "Creating account…" : "Create account"}
              </Button>
            </div>
          </form>
          )
        ) : (
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="loginEmail">Email</Label>
              <Input
                id="loginEmail"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <Label htmlFor="loginPassword">Password</Label>
                <button
                  type="button"
                  onClick={handleForgot}
                  className="text-xs text-primary hover:underline"
                >
                  Forgot password?
                </button>
              </div>
              <Input
                id="loginPassword"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Signing in…" : "Sign in"}
            </Button>

            <p className="text-sm text-center text-muted-foreground">
              New to EasyMeet?{" "}
              <button
                type="button"
                className="text-primary font-medium hover:underline"
                onClick={() => {
                  reset();
                  setMode("signup");
                }}
              >
                Create an account
              </button>
            </p>
          </form>
        )}

      </DialogContent>
    </Dialog>
  );
}