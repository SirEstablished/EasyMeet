import { createFileRoute } from "@tanstack/react-router";
import { LegalPageShell } from "@/components/LegalPageShell";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — EasyMeet" },
      { name: "description", content: "How EasyMeet collects, uses, and protects your data." },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <LegalPageShell title="Privacy Policy">
      <p>Last updated: {new Date().toLocaleDateString()}</p>
      <p>
        Your privacy matters to us. This policy explains, in simple terms,
        what information EasyMeet collects, how we use it, and the choices
        you have.
      </p>
      <h2 className="text-xl font-semibold mt-6">Information we collect</h2>
      <p>
        We collect the information you provide when you create an account —
        such as your name, email, profile photo, and any details you add to
        your profile. We also collect basic usage data to keep the service
        reliable and secure.
      </p>
      <h2 className="text-xl font-semibold mt-6">How we use it</h2>
      <p>
        We use your information to power EasyMeet — showing your profile,
        services, and posts to other users; enabling bookings, payments, and
        messaging; and improving the platform.
      </p>
      <h2 className="text-xl font-semibold mt-6">Data protection</h2>
      <p>
        We use industry-standard safeguards including encrypted connections
        and access controls. We never sell your personal data.
      </p>
      <h2 className="text-xl font-semibold mt-6">Your choices</h2>
      <p>
        You can edit or remove information from your profile at any time, or
        delete your account by contacting{" "}
        <a className="text-primary hover:underline" href="mailto:easymeetofficial@gmail.com">
          easymeetofficial@gmail.com
        </a>.
      </p>
    </LegalPageShell>
  );
}