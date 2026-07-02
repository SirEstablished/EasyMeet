import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";
import { Footer } from "@/components/Footer";
import { useAuth, useAuthModal, useTheme } from "@/lib/providers";
import {
  ShieldCheck,
  CalendarCheck,
  MessageCircle,
  UserPlus,
  Search,
  Handshake,
  Star,
  Moon,
  Sun,
} from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "EasyMeet — Find Verified Professionals Near You" },
      { name: "description", content: "Nigeria's trusted marketplace connecting customers with verified local professionals and businesses." },
      { property: "og:title", content: "EasyMeet — Find Verified Professionals Near You" },
      { property: "og:description", content: "Nigeria's trusted service marketplace." },
    ],
  }),
  component: Landing,
});

function Landing() {
  const { openModal } = useAuthModal();
  const { user, loading } = useAuth();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();

  // If a session is present (e.g. returning from Google OAuth), send the
  // user straight to their dashboard.
  useEffect(() => {
    if (!loading && user) {
      navigate({ to: "/dashboard" });
    }
  }, [loading, user, navigate]);

  const goApp = () => {
    if (user) navigate({ to: "/dashboard" });
    else openModal("signup");
  };

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <header className="sticky top-0 z-30 glass-panel">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 h-16 flex items-center justify-between gap-2">
          <Logo />
          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle theme" className="h-9 w-9">
              {theme === "light" ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
            </Button>
            <Button variant="ghost" onClick={() => openModal("login")} className="hidden sm:inline-flex">
              Sign in
            </Button>
            <Button onClick={() => openModal("signup")} className="bg-gradient-brand glow-primary h-9 px-3 text-sm sm:px-4">
              <span className="sm:hidden">Start</span>
              <span className="hidden sm:inline">Get Started</span>
            </Button>
          </div>
        </div>
      </header>

      {/* HERO */}
      <section className="relative overflow-hidden min-h-[92vh] flex items-center">
        <div className="absolute inset-0 -z-10 bg-mesh-brand opacity-[0.28] dark:opacity-[0.45]" />
        <div className="absolute -top-32 -left-32 -z-10 h-96 w-96 rounded-full bg-primary/30 blur-3xl float-soft" />
        <div className="absolute -bottom-32 -right-32 -z-10 h-[28rem] w-[28rem] rounded-full bg-accent/30 blur-3xl float-soft-slow" />
        <div className="absolute top-1/3 right-1/4 -z-10 h-72 w-72 rounded-full bg-coral/25 blur-3xl float-soft-delayed" />

        {/* Floating profile cards (decorative, desktop only) */}
        <div className="hidden lg:block pointer-events-none absolute inset-0 -z-[5]">
          <FloatingProfile className="left-[6%] top-[22%] float-soft" name="Adaeze O." role="Photographer" rating={4.9} blue />
          <FloatingProfile className="right-[7%] top-[18%] float-soft-delayed" name="Lagos Bakery" role="Business" rating={4.8} white />
          <FloatingProfile className="left-[12%] bottom-[14%] float-soft-slow" name="Tunde B." role="Plumber" rating={5.0} gold />
          <FloatingProfile className="right-[10%] bottom-[18%] float-soft" name="Chidi M." role="Tutor" rating={4.7} blue />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-24 sm:py-32 text-center w-full">
          <div className="inline-flex items-center gap-2 rounded-full glass-card px-3 py-1 text-xs font-medium text-muted-foreground mb-6">
            <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
            Now live in Nigeria
          </div>
          <h1 className="text-5xl sm:text-7xl font-extrabold tracking-tight max-w-4xl mx-auto leading-[1.02]">
            Find <span className="text-gradient-tri">Verified Professionals</span> Near You
          </h1>
          <p className="mt-6 max-w-2xl mx-auto text-lg sm:text-xl text-muted-foreground">
            EasyMeet is Nigeria's top service marketplace — connecting customers with trusted local
            professionals and businesses, in minutes.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3 max-w-sm sm:max-w-none mx-auto">
            <Button size="lg" className="bg-gradient-brand text-primary-foreground h-12 px-8 rounded-full glow-primary hover:scale-[1.03] transition-transform w-full sm:w-auto" onClick={goApp}>
              Get Started Free
            </Button>
            <Button size="lg" variant="outline" className="h-12 px-8 rounded-full glass-card border-white/40 hover:bg-primary/5 w-full sm:w-auto" onClick={() => openModal("signup")}>
              See How It Works
            </Button>
          </div>
        </div>

        {/* Marquee ticker of profession categories */}
        <div className="absolute bottom-0 left-0 right-0 overflow-hidden border-y border-border/60 bg-background/40 backdrop-blur-md py-3">
          <div className="flex w-max animate-marquee whitespace-nowrap text-sm sm:text-base font-semibold text-muted-foreground">
            {Array.from({ length: 2 }).map((_, dup) => (
              <div key={dup} className="flex items-center gap-8 px-4">
                {["Plumbers","Designers","Lawyers","Chefs","Photographers","Teachers","Developers","Accountants","Stylists","Electricians","Tutors","Event Planners"].map((p, i) => (
                  <span key={`${dup}-${i}`} className="flex items-center gap-8">
                    <span className="text-gradient-brand">{p}</span>
                    <span className="text-primary/40">•</span>
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* STATS */}
      <section className="relative overflow-hidden border-b border-border/60">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(color-mix(in_oklab,var(--primary)_22%,transparent)_1px,transparent_1px)] [background-size:24px_24px] opacity-30" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-br from-primary/10 via-transparent to-accent/10" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-16 grid gap-8 sm:grid-cols-3 text-center">
          {[
            { num: "10,000+", label: "Professionals" },
            { num: "50,000+", label: "Customers" },
            { num: "₦500M+", label: "Transactions" },
          ].map((s) => (
            <div key={s.label} className="rounded-2xl glass-card p-8 lift-hover hover:-translate-y-1">
              <div className="text-5xl sm:text-6xl font-extrabold tracking-tight text-gradient-tri">{s.num}</div>
              <div className="mt-2 text-sm font-medium text-muted-foreground uppercase tracking-widest">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* FEATURES */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-20">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold">Why <span className="text-gradient-brand">EasyMeet</span></h2>
          <p className="text-muted-foreground mt-2">Everything you need to find and work with the right professional.</p>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          {[
            { Icon: ShieldCheck, title: "Verified Profiles", desc: "Every professional is reviewed and verified for your peace of mind." },
            { Icon: CalendarCheck, title: "Easy Booking", desc: "Browse, compare, and book trusted services in just a few taps." },
            { Icon: MessageCircle, title: "Secure Messaging", desc: "Chat privately with professionals before you commit." },
          ].map(({ Icon, title, desc }) => (
            <div key={title} className="rounded-2xl glass-card p-6 lift-hover hover:-translate-y-1 hover:shadow-2xl hover:border-primary/50">
              <div className="h-12 w-12 rounded-xl bg-gradient-brand text-primary-foreground flex items-center justify-center mb-4 glow-primary">
                <Icon className="h-6 w-6" />
              </div>
              <h3 className="font-semibold text-lg">{title}</h3>
              <p className="text-sm text-muted-foreground mt-1.5">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="border-y border-border/60 relative overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-gradient-to-br from-primary/5 via-transparent to-accent/5" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-20">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold">How it <span className="text-gradient-brand">works</span></h2>
            <p className="text-muted-foreground mt-2">Three simple steps to your next service.</p>
          </div>
          <div className="grid gap-6 md:grid-cols-3 relative">
            <div className="hidden md:block absolute top-1/2 left-[16%] right-[16%] h-px border-t-2 border-dashed border-primary/30" />
            {[
              { Icon: UserPlus, n: "01", title: "Sign Up", desc: "Create your free account in seconds." },
              { Icon: Search, n: "02", title: "Find a Professional", desc: "Search verified pros near you." },
              { Icon: Handshake, n: "03", title: "Book & Connect", desc: "Message, book, and get it done." },
            ].map(({ Icon, n, title, desc }) => (
              <div key={n} className="rounded-2xl glass-card p-6 relative lift-hover hover:-translate-y-1">
                <div className="absolute -top-4 -right-2 text-6xl font-extrabold text-gradient-brand opacity-90 select-none">
                  {n}
                </div>
                <div className="h-11 w-11 rounded-xl bg-gradient-brand text-primary-foreground flex items-center justify-center mb-3 glow-primary">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="font-semibold text-lg">{title}</h3>
                <p className="text-sm text-muted-foreground mt-1.5">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* TESTIMONIALS */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-20">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold">Loved across <span className="text-gradient-brand">Nigeria</span></h2>
          <p className="text-muted-foreground mt-2">Real stories from real users.</p>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          {[
            { name: "Chidinma A.", role: "Customer, Lagos", quote: "I found an amazing tailor in under 10 minutes. EasyMeet is the real deal." },
            { name: "Tunde B.", role: "Professional, Abuja", quote: "Booking requests stream in every week — it transformed my business." },
            { name: "Kemi’s Salon", role: "Business, Ibadan", quote: "Verified profile gave us instant trust. Customers love it." },
          ].map((t) => (
            <div key={t.name} className="rounded-2xl glass-card gradient-border p-6 lift-hover hover:-translate-y-1">
              <div className="flex gap-0.5 text-amber-400 mb-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} className="h-4 w-4 fill-current" />
                ))}
              </div>
              <p className="text-sm">"{t.quote}"</p>
              <div className="mt-4">
                <div className="font-semibold text-sm">{t.name}</div>
                <div className="text-xs text-muted-foreground">{t.role}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 pb-20">
        <div className="rounded-3xl bg-mesh-brand p-10 sm:p-14 text-center text-primary-foreground glow-primary relative overflow-hidden">
          <div className="absolute inset-0 opacity-20 [background-image:radial-gradient(white_1px,transparent_1px)] [background-size:18px_18px]" />
          <h2 className="relative text-3xl sm:text-5xl font-bold">Ready to meet your match?</h2>
          <p className="relative mt-3 opacity-90">Join thousands of Nigerians using EasyMeet every day.</p>
          <Button size="lg" variant="secondary" className="relative mt-6 h-12 px-8 rounded-full hover:scale-[1.03] transition-transform" onClick={goApp}>
            Get Started Free
          </Button>
        </div>
      </section>

      <Footer />
    </div>
  );
}

function FloatingProfile({
  className,
  name,
  role,
  rating,
  blue,
  white,
  gold,
}: {
  className?: string;
  name: string;
  role: string;
  rating: number;
  blue?: boolean;
  white?: boolean;
  gold?: boolean;
}) {
  const initials = name.split(" ").map((s) => s[0]).slice(0, 2).join("");
  return (
    <div className={`absolute glass-card rounded-2xl p-3 pr-5 flex items-center gap-3 shadow-xl w-56 ${className ?? ""}`}>
      <span className="inline-block rounded-full p-[2px] bg-gradient-brand">
        <span className="h-10 w-10 rounded-full bg-card flex items-center justify-center text-xs font-bold text-gradient-brand border-2 border-background">
          {initials}
        </span>
      </span>
      <div className="min-w-0">
        <div className="flex items-center gap-1 text-sm font-semibold truncate">
          {name}
          {blue && <span className="h-3.5 w-3.5 rounded-full bg-[#1d9bf0] inline-flex items-center justify-center text-[8px] text-white">✓</span>}
          {white && <span className="h-3.5 w-3.5 rounded-full bg-white border border-slate-300 inline-flex items-center justify-center text-[8px] text-slate-700">✓</span>}
          {gold && <span className="h-3.5 w-3.5 rounded-full gold-shimmer inline-flex items-center justify-center text-[8px] text-white">★</span>}
        </div>
        <div className="text-[11px] text-muted-foreground">{role}</div>
        <div className="text-[11px] text-amber-500 flex items-center gap-0.5 mt-0.5">
          <Star className="h-3 w-3 fill-current" /> {rating}
        </div>
      </div>
    </div>
  );
}
