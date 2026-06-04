import { createFileRoute } from "@tanstack/react-router";
import { LegalPageShell } from "@/components/LegalPageShell";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About EasyMeet" },
      { name: "description", content: "EasyMeet connects customers with verified local professionals and businesses across Nigeria and beyond." },
    ],
  }),
  component: AboutPage,
});

function AboutPage() {
  return (
    <LegalPageShell title="About EasyMeet">
      <p>
        EasyMeet connects customers with verified local professionals and
        businesses across Nigeria and beyond. Our mission is to make finding
        trusted services fast, safe, and easy.
      </p>
      <p>
        Whether you need a plumber, designer, chef, tutor, or a verified
        business, EasyMeet helps you discover the right people, book them
        with confidence, and pay securely — all in one place.
      </p>
      <h2 className="text-xl font-semibold mt-8">Contact</h2>
      <p>
        Have a question or partnership idea?{" "}
        <a className="text-primary hover:underline" href="mailto:easymeetofficial@gmail.com">
          easymeetofficial@gmail.com
        </a>
      </p>
    </LegalPageShell>
  );
}