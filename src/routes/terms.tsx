import { createFileRoute } from "@tanstack/react-router";
import { LegalPageShell } from "@/components/LegalPageShell";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Service — EasyMeet" },
      { name: "description", content: "The rules that govern your use of EasyMeet." },
    ],
  }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <LegalPageShell title="Terms of Service">
      <p>Last updated: {new Date().toLocaleDateString()}</p>
      <p>
        By using EasyMeet you agree to these terms. Please read them
        carefully — they explain what you can expect from us and what we ask
        of you.
      </p>
      <h2 className="text-xl font-semibold mt-6">Your account</h2>
      <p>
        You are responsible for keeping your account credentials safe and
        for the activity that happens under your account. Provide accurate
        information and keep it up to date.
      </p>
      <h2 className="text-xl font-semibold mt-6">Acceptable use</h2>
      <p>
        Do not use EasyMeet to harass others, post illegal content, or
        attempt to bypass safety features. Sharing phone numbers in chats,
        comments, or posts is not allowed — please keep transactions on the
        platform so we can protect everyone.
      </p>
      <h2 className="text-xl font-semibold mt-6">Payments &amp; bookings</h2>
      <p>
        EasyMeet facilitates payments and bookings between customers and
        providers. Providers are independent and responsible for the
        services they deliver.
      </p>
      <h2 className="text-xl font-semibold mt-6">Changes</h2>
      <p>
        We may update these terms from time to time. Continued use after an
        update means you accept the new terms.
      </p>
      <p>
        Questions? Email{" "}
        <a className="text-primary hover:underline" href="mailto:easymeetofficial@gmail.com">
          easymeetofficial@gmail.com
        </a>.
      </p>
    </LegalPageShell>
  );
}