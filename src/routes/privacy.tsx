import { createFileRoute } from "@tanstack/react-router";
import { LegalPageShell } from "@/components/LegalPageShell";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — EasyMeet" },
      { name: "description", content: "How EasyMeet collects, uses, and protects your personal information." },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <LegalPageShell title="Privacy Policy">
      <p className="text-sm text-muted-foreground">Last updated: July 8, 2026</p>
      <p className="text-lg text-foreground">
        Your privacy matters to us. This policy explains, in clear terms, what
        information EasyMeet collects, how we use it, and the choices you have
        regarding your data.
      </p>

      <h2 className="text-xl font-semibold mt-8 pt-4 border-t border-border">1. Information We Collect</h2>
      <h3 className="font-semibold mt-4">Information You Provide</h3>
      <ul className="list-disc pl-5 space-y-2 mt-2">
        <li><span className="font-medium">Account Information:</span> Name, email address, phone number, and profile photo when you create an account.</li>
        <li><span className="font-medium">Profile Details:</span> Professional bio, services offered, portfolio images, and pricing information if you are a service provider.</li>
        <li><span className="font-medium">Booking Data:</span> Service requests, messages, reviews, and transaction details.</li>
        <li><span className="font-medium">Payment Information:</span> Payment method details processed securely through our payment partners. We do not store card numbers on our servers.</li>
      </ul>

      <h3 className="font-semibold mt-4">Information Collected Automatically</h3>
      <ul className="list-disc pl-5 space-y-2 mt-2">
        <li><span className="font-medium">Usage Data:</span> Pages visited, features used, search queries, and interaction patterns.</li>
        <li><span className="font-medium">Device Information:</span> Browser type, operating system, device type, and screen resolution.</li>
        <li><span className="font-medium">Location Data:</span> General location based on IP address to show relevant local services. We do not track precise GPS location without your consent.</li>
      </ul>

      <h2 className="text-xl font-semibold mt-8 pt-4 border-t border-border">2. How We Use Your Information</h2>
      <ul className="list-disc pl-5 space-y-2 mt-3">
        <li>Provide and maintain the EasyMeet platform</li>
        <li>Process bookings and facilitate secure payments</li>
        <li>Display profiles, services, and reviews to other users</li>
        <li>Enable messaging between customers and professionals</li>
        <li>Send booking confirmations, reminders, and account notifications</li>
        <li>Detect and prevent fraud, abuse, and security incidents</li>
        <li>Improve our platform through analytics and user feedback</li>
        <li>Comply with legal obligations and resolve disputes</li>
      </ul>

      <h2 className="text-xl font-semibold mt-8 pt-4 border-t border-border">3. How We Share Your Information</h2>
      <p>
        We do not sell your personal data. We only share information in the
        following circumstances:
      </p>
      <ul className="list-disc pl-5 space-y-2 mt-3">
        <li><span className="font-medium">With other users:</span> Your public profile information is visible to other users as intended by the platform.</li>
        <li><span className="font-medium">With service providers:</span> Booking details are shared with the professional you are booking to fulfill the service.</li>
        <li><span className="font-medium">With payment processors:</span> Transaction data is shared with our payment partners to process payments securely.</li>
        <li><span className="font-medium">For legal compliance:</span> When required by law, court order, or to protect the safety of our users.</li>
      </ul>

      <h2 className="text-xl font-semibold mt-8 pt-4 border-t border-border">4. Data Security</h2>
      <p>
        We implement industry-standard security measures to protect your data,
        including:
      </p>
      <ul className="list-disc pl-5 space-y-2 mt-3">
        <li>SSL/TLS encryption for all data in transit</li>
        <li>Encrypted storage for sensitive personal information</li>
        <li>Regular security audits and vulnerability assessments</li>
        <li>Strict access controls and authentication requirements</li>
        <li>Continuous monitoring for unauthorized access attempts</li>
      </ul>

      <h2 className="text-xl font-semibold mt-8 pt-4 border-t border-border">5. Data Retention</h2>
      <p>
        We retain your personal information for as long as your account is active
        or as needed to provide services. If you delete your account, we will
        remove your personal data within 30 days, except where we need to retain
        certain information for legal, contractual, or legitimate business purposes.
      </p>

      <h2 className="text-xl font-semibold mt-8 pt-4 border-t border-border">6. Your Rights</h2>
      <p>You have the following rights regarding your personal data:</p>
      <ul className="list-disc pl-5 space-y-2 mt-3">
        <li><span className="font-medium">Access:</span> Request a copy of the personal data we hold about you.</li>
        <li><span className="font-medium">Correction:</span> Request correction of inaccurate or incomplete data.</li>
        <li><span className="font-medium">Deletion:</span> Request deletion of your personal data from our systems.</li>
        <li><span className="font-medium">Portability:</span> Request your data in a portable, machine-readable format.</li>
        <li><span className="font-medium">Objection:</span> Object to processing of your data for specific purposes.</li>
      </ul>

      <h2 className="text-xl font-semibold mt-8 pt-4 border-t border-border">7. Cookies & Tracking</h2>
      <p>
        EasyMeet uses essential cookies to maintain your session and remember
        your preferences. We may also use analytics cookies to understand how
        users interact with our platform. You can manage cookie preferences
        through your browser settings.
      </p>

      <h2 className="text-xl font-semibold mt-8 pt-4 border-t border-border">8. Children's Privacy</h2>
      <p>
        EasyMeet is not intended for users under the age of 18. We do not
        knowingly collect personal information from children. If we become
        aware that a child has provided us with personal data, we will take
        steps to delete it promptly.
      </p>

      <h2 className="text-xl font-semibold mt-8 pt-4 border-t border-border">9. Changes to This Policy</h2>
      <p>
        We may update this privacy policy from time to time. We will notify
        you of significant changes by posting the updated policy on this page
        and updating the "Last updated" date. Your continued use of EasyMeet
        after changes are posted constitutes acceptance of the updated policy.
      </p>

      <h2 className="text-xl font-semibold mt-8 pt-4 border-t border-border">10. Contact Us</h2>
      <p>
        If you have any questions about this privacy policy or how we handle
        your data, please contact us:
      </p>
      <div className="mt-3 rounded-xl border border-border p-4 bg-muted/30">
        <p className="text-sm">
          <span className="font-semibold">Email:</span>{" "}
          <a className="text-primary hover:underline" href="mailto:easymeetofficial@gmail.com">
            easymeetofficial@gmail.com
          </a>
        </p>
        <p className="text-sm mt-1">
          <span className="font-semibold">Data Protection Officer:</span>{" "}
          <a className="text-primary hover:underline" href="mailto:easymeetofficial@gmail.com">
            easymeetofficial@gmail.com
          </a>
        </p>
      </div>
    </LegalPageShell>
  );
}
