import { createFileRoute } from "@tanstack/react-router";
import { LegalPageShell } from "@/components/LegalPageShell";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Service — EasyMeet" },
      { name: "description", content: "The terms and conditions governing your use of the EasyMeet platform." },
    ],
  }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <LegalPageShell title="Terms of Service">
      <p className="text-sm text-muted-foreground">Last updated: July 8, 2026</p>
      <p className="text-lg text-foreground">
        By using EasyMeet, you agree to these terms. Please read them carefully —
        they explain what you can expect from us and what we ask of you.
      </p>

      <h2 className="text-xl font-semibold mt-8 pt-4 border-t border-border">1. Acceptance of Terms</h2>
      <p>
        By creating an account, accessing, or using the EasyMeet platform, you
        agree to be bound by these Terms of Service and our Privacy Policy. If
        you do not agree to these terms, you must not use the platform.
      </p>

      <h2 className="text-xl font-semibold mt-8 pt-4 border-t border-border">2. Eligibility</h2>
      <p>
        You must be at least 18 years old to use EasyMeet. By using the platform,
        you represent and warrant that you meet this age requirement and have the
        legal capacity to enter into these terms.
      </p>

      <h2 className="text-xl font-semibold mt-8 pt-4 border-t border-border">3. Your Account</h2>
      <p>
        You are responsible for maintaining the confidentiality of your account
        credentials and for all activities that occur under your account. You agree to:
      </p>
      <ul className="list-disc pl-5 space-y-2 mt-3">
        <li>Provide accurate, current, and complete information during registration</li>
        <li>Maintain and update your information to keep it accurate and complete</li>
        <li>Notify us immediately of any unauthorized use of your account</li>
        <li>Accept responsibility for all activities that happen under your account</li>
      </ul>

      <h2 className="text-xl font-semibold mt-8 pt-4 border-t border-border">4. Acceptable Use</h2>
      <p>You agree not to:</p>
      <ul className="list-disc pl-5 space-y-2 mt-3">
        <li>Use EasyMeet for any unlawful purpose or in violation of any applicable law</li>
        <li>Harass, threaten, or intimidate other users</li>
        <li>Post false, misleading, or fraudulent content</li>
        <li>Attempt to bypass, disable, or interfere with platform security features</li>
        <li>Share phone numbers, addresses, or contact information in chats, posts, or comments — please keep all transactions on the platform so we can protect everyone</li>
        <li>Use automated systems or bots to access or interact with the platform</li>
        <li>Impersonate another person or entity</li>
        <li>Collect or harvest other users' personal information without consent</li>
      </ul>

      <h2 className="text-xl font-semibold mt-8 pt-4 border-t border-border">5. Services & Bookings</h2>
      <p>
        EasyMeet facilitates connections between customers and service providers.
        We are not a party to the service agreement between you and a professional.
      </p>
      <ul className="list-disc pl-5 space-y-2 mt-3">
        <li><span className="font-medium">Customers:</span> You are responsible for reviewing professional profiles, communicating your requirements clearly, and confirming service completion.</li>
        <li><span className="font-medium">Professionals:</span> You are responsible for delivering services as described, maintaining accurate availability, and responding to booking requests promptly.</li>
      </ul>

      <h2 className="text-xl font-semibold mt-8 pt-4 border-t border-border">6. Payments & Escrow</h2>
      <p>
        All payments made through EasyMeet are processed via our secure escrow
        system. Funds are held in escrow until the customer confirms service
        completion. This protects both parties and ensures fair transactions.
      </p>
      <ul className="list-disc pl-5 space-y-2 mt-3">
        <li>Payments are released to the professional after customer confirmation</li>
        <li>Refund requests are handled through our dispute resolution process</li>
        <li>Service fees may apply and will be clearly displayed before booking</li>
        <li>All prices are displayed in Nigerian Naira (NGN)</li>
      </ul>

      <h2 className="text-xl font-semibold mt-8 pt-4 border-t border-border">7. Reviews & Ratings</h2>
      <p>
        Reviews and ratings reflect the genuine experience of users. We reserve
        the right to remove reviews that are fake, fraudulent, or violate our
        community guidelines. Professionals are encouraged to respond to reviews
        professionally and constructively.
      </p>

      <h2 className="text-xl font-semibold mt-8 pt-4 border-t border-border">8. Dispute Resolution</h2>
      <p>
        If a dispute arises between a customer and a professional, EasyMeet
        provides a resolution process to help mediate the issue. Both parties
        agree to engage in good faith with our dispute resolution team. Decisions
        made through the dispute process are final and binding.
      </p>

      <h2 className="text-xl font-semibold mt-8 pt-4 border-t border-border">9. Intellectual Property</h2>
      <p>
        All content, logos, trademarks, and materials on the EasyMeet platform
        are the property of EasyMeet or its licensors. You may not copy, modify,
        distribute, or use any content from the platform without prior written
        consent.
      </p>

      <h2 className="text-xl font-semibold mt-8 pt-4 border-t border-border">10. Limitation of Liability</h2>
      <p>
        EasyMeet is provided "as is" without warranties of any kind. We are not
        liable for any indirect, incidental, special, or consequential damages
        arising from your use of the platform. Our total liability shall not
        exceed the amount of service fees you paid in the twelve months preceding
        the claim.
      </p>

      <h2 className="text-xl font-semibold mt-8 pt-4 border-t border-border">11. Termination</h2>
      <p>
        We reserve the right to suspend or terminate your account at any time,
        with or without notice, for conduct that violates these terms or is
        harmful to other users, the platform, or third parties. You may also
        delete your account at any time through your account settings.
      </p>

      <h2 className="text-xl font-semibold mt-8 pt-4 border-t border-border">12. Changes to These Terms</h2>
      <p>
        We may update these terms from time to time. When we make significant
        changes, we will notify you via email or through the platform. Continued
        use of EasyMeet after changes are posted constitutes acceptance of the
        new terms.
      </p>

      <h2 className="text-xl font-semibold mt-8 pt-4 border-t border-border">13. Governing Law</h2>
      <p>
        These terms are governed by and construed in accordance with the laws
        of the Federal Republic of Nigeria. Any disputes arising under these
        terms shall be subject to the exclusive jurisdiction of the courts in
        Lagos, Nigeria.
      </p>

      <h2 className="text-xl font-semibold mt-8 pt-4 border-t border-border">14. Contact Us</h2>
      <p>
        If you have any questions about these terms, please contact us:
      </p>
      <div className="mt-3 rounded-xl border border-border p-4 bg-muted/30">
        <p className="text-sm">
          <span className="font-semibold">Email:</span>{" "}
          <a className="text-primary hover:underline" href="mailto:easymeetofficial@gmail.com">
            easymeetofficial@gmail.com
          </a>
        </p>
        <p className="text-sm mt-1">
          <span className="font-semibold">Location:</span> Lagos, Nigeria
        </p>
      </div>
    </LegalPageShell>
  );
}
