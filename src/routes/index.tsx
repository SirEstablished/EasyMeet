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
  const { user } = useAuth();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();

  const goApp = () => {
    if (user) navigate({ to: "/dashboard" });
    else openModal("signup");
  };

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Logo />
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle theme">
              {theme === "light" ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
            </Button>
            <Button variant="ghost" onClick={() => openModal("login")}>
              Sign in
            </Button>
            <Button onClick={() => openModal("signup")} className="bg-gradient-brand">
              Get Started
            </Button>
          </div>
        </div>
      </header>

      {/* HERO */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-primary/10 via-transparent to-transparent" />
        <div className="absolute -top-32 -left-32 -z-10 h-96 w-96 rounded-full bg-primary/20 blur-3xl" />
        <div className="absolute -bottom-32 -right-32 -z-10 h-96 w-96 rounded-full bg-accent/20 blur-3xl" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-24 sm:py-32 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1 text-xs font-medium text-muted-foreground mb-6">
            <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
            Now live in Nigeria
          </div>
          <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight max-w-4xl mx-auto leading-[1.05]">
            Find <span className="text-gradient-brand">Verified Professionals</span> Near You
          </h1>
          <p className="mt-6 max-w-2xl mx-auto text-lg text-muted-foreground">
            EasyMeet is Nigeria's top service marketplace — connecting customers with trusted local
            professionals and businesses, in minutes.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button size="lg" className="bg-gradient-brand text-primary-foreground h-12 px-7" onClick={goApp}>
              Get Started
            </Button>
            <Button size="lg" variant="outline" className="h-12 px-7" onClick={() => openModal("signup")}>
              Browse Professionals
            </Button>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-20">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <h2 className="text-3xl font-bold">Why EasyMeet</h2>
          <p className="text-muted-foreground mt-2">Everything you need to find and work with the right professional.</p>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          {[
            { Icon: ShieldCheck, title: "Verified Profiles", desc: "Every professional is reviewed and verified for your peace of mind." },
            { Icon: CalendarCheck, title: "Easy Booking", desc: "Browse, compare, and book trusted services in just a few taps." },
            { Icon: MessageCircle, title: "Secure Messaging", desc: "Chat privately with professionals before you commit." },
          ].map(({ Icon, title, desc }) => (
            <div key={title} className="rounded-2xl border border-border bg-card p-6 hover:shadow-lg hover:-translate-y-0.5 transition-all">
              <div className="h-12 w-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-4">
                <Icon className="h-6 w-6" />
              </div>
              <h3 className="font-semibold text-lg">{title}</h3>
              <p className="text-sm text-muted-foreground mt-1.5">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="bg-secondary/40 border-y border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-20">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <h2 className="text-3xl font-bold">How it works</h2>
            <p className="text-muted-foreground mt-2">Three simple steps to your next service.</p>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            {[
              { Icon: UserPlus, n: "01", title: "Sign Up", desc: "Create your free account in seconds." },
              { Icon: Search, n: "02", title: "Find a Professional", desc: "Search verified pros near you." },
              { Icon: Handshake, n: "03", title: "Book & Connect", desc: "Message, book, and get it done." },
            ].map(({ Icon, n, title, desc }) => (
              <div key={n} className="rounded-2xl bg-card border border-border p-6 relative">
                <div className="absolute -top-3 -right-3 text-5xl font-extrabold text-primary/10 select-none">
                  {n}
                </div>
                <Icon className="h-7 w-7 text-accent mb-3" />
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
          <h2 className="text-3xl font-bold">Loved across Nigeria</h2>
          <p className="text-muted-foreground mt-2">Real stories from real users.</p>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          {[
            { name: "Chidinma A.", role: "Customer, Lagos", quote: "I found an amazing tailor in under 10 minutes. EasyMeet is the real deal." },
            { name: "Tunde B.", role: "Professional, Abuja", quote: "Booking requests stream in every week — it transformed my business." },
            { name: "Kemi’s Salon", role: "Business, Ibadan", quote: "Verified profile gave us instant trust. Customers love it." },
          ].map((t) => (
            <div key={t.name} className="rounded-2xl border border-border bg-card p-6">
              <div className="flex gap-0.5 text-accent mb-3">
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
        <div className="rounded-3xl bg-gradient-brand p-10 sm:p-14 text-center text-primary-foreground">
          <h2 className="text-3xl sm:text-4xl font-bold">Ready to meet your match?</h2>
          <p className="mt-3 opacity-90">Join thousands of Nigerians using EasyMeet every day.</p>
          <Button size="lg" variant="secondary" className="mt-6 h-12 px-8" onClick={goApp}>
            Get Started Free
          </Button>
        </div>
      </section>

      <Footer />
    </div>
  );
}
