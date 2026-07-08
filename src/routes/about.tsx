import { createFileRoute } from "@tanstack/react-router";
import { LegalPageShell } from "@/components/LegalPageShell";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About EasyMeet" },
      {
        name: "description",
        content:
          "Learn about EasyMeet — Nigeria's trusted marketplace connecting customers with verified local professionals and businesses.",
      },
    ],
  }),
  component: AboutPage,
});

function AboutPage() {
  return (
    <LegalPageShell title="About EasyMeet">
      <p className="text-lg text-foreground">
        EasyMeet is Nigeria's leading service marketplace, connecting customers with verified local
        professionals and businesses. We started with a simple idea: finding trusted help should be
        fast, safe, and effortless.
      </p>

      <h2 className="text-xl font-semibold mt-8 pt-4 border-t border-border">Our Mission</h2>
      <p>
        Our mission is to bridge the gap between people who need services and professionals who
        deliver them. We believe every Nigerian deserves access to reliable, verified, and
        affordable local services — whether it is a plumber for a leaky pipe, a tutor for exam
        preparation, or a photographer for a special event.
      </p>

      <h2 className="text-xl font-semibold mt-8 pt-4 border-t border-border">What We Do</h2>
      <p>
        EasyMeet provides a trusted platform where customers can discover, compare, and book
        verified professionals in their area. Every professional on our platform goes through a
        rigorous verification process including identity checks, portfolio reviews, and background
        screening.
      </p>
      <ul className="list-disc pl-5 space-y-2 mt-3">
        <li>Verified profiles you can trust</li>
        <li>Secure escrow payments for every booking</li>
        <li>Real reviews from real customers</li>
        <li>Instant messaging with professionals</li>
        <li>Dispute resolution and buyer protection</li>
      </ul>

      <h2 className="text-xl font-semibold mt-8 pt-4 border-t border-border">Our Story</h2>
      <p>
        Founded in 2026, EasyMeet was born out of the frustration of finding reliable professionals
        in Nigeria. Too often, people relied on word-of-mouth with no way to verify quality or
        trustworthiness. We built EasyMeet to solve that problem — creating a marketplace where
        trust is built into every interaction.
      </p>
      <p>
        Today, EasyMeet serves thousands of customers and professionals across Lagos, Abuja, Port
        Harcourt, Ibadan, and beyond. We are rapidly expanding to cover more cities and service
        categories across Nigeria.
      </p>

      <h2 className="text-xl font-semibold mt-8 pt-4 border-t border-border">Our Values</h2>
      <div className="grid sm:grid-cols-2 gap-4 mt-3">
        <div className="rounded-xl border border-border p-4">
          <h3 className="font-semibold">Trust First</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Every profile is verified. Every payment is protected. Trust is the foundation of
            everything we do.
          </p>
        </div>
        <div className="rounded-xl border border-border p-4">
          <h3 className="font-semibold">Customer Focus</h3>
          <p className="text-sm text-muted-foreground mt-1">
            We build for the people who use EasyMeet every day. Their feedback shapes our product
            and drives our decisions.
          </p>
        </div>
        <div className="rounded-xl border border-border p-4">
          <h3 className="font-semibold">Safety & Security</h3>
          <p className="text-sm text-muted-foreground mt-1">
            From escrow payments to dispute resolution, we ensure every transaction is safe and
            fair.
          </p>
        </div>
        <div className="rounded-xl border border-border p-4">
          <h3 className="font-semibold">Empowering Professionals</h3>
          <p className="text-sm text-muted-foreground mt-1">
            We help professionals grow their businesses, reach new customers, and build lasting
            reputations.
          </p>
        </div>
      </div>

      <h2 className="text-xl font-semibold mt-8 pt-4 border-t border-border">Contact Us</h2>
      <p>
        Have a question, partnership idea, or want to join our team? We would love to hear from you.
      </p>
      <div className="mt-3 rounded-xl border border-border p-4 bg-muted/30">
        <p className="text-sm">
          <span className="font-semibold">Email:</span>{" "}
          <a className="text-primary hover:underline" href="mailto:easymeetofficial@gmail.com">
            easymeetofficial@gmail.com
          </a>
        </p>
        <p className="text-sm mt-1">
          <span className="font-semibold">Location:</span> Anambra, Nigeria
        </p>
      </div>
    </LegalPageShell>
  );
}
