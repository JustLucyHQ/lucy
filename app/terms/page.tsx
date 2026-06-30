import type { Metadata } from 'next';
import { LegalLayout } from '@/components/site/LegalLayout';

export const metadata: Metadata = {
  title: 'Terms of Use — Lucy AI',
  description: 'The terms and conditions for using Lucy (justlucy.ai).',
};

const UPDATED = 'June 30, 2026';

export default function TermsPage() {
  return (
    <LegalLayout
      title="Terms of Use"
      updated={UPDATED}
      intro="These Terms of Use (“Terms”) govern your access to and use of the Lucy application and the website at justlucy.ai (the “Service”), operated by JustLucy (“we”, “us”). By creating an account or using the Service, you agree to these Terms. If you do not agree, do not use the Service."
    >
      <h2>Eligibility</h2>
      <p>
        You must be at least 18 years old, or the age of majority in your jurisdiction, to use the
        Service. By using it you represent that you meet this requirement and that the information you
        provide is accurate.
      </p>

      <h2>Your account</h2>
      <p>
        You are responsible for maintaining the confidentiality of your account credentials and for all
        activity under your account. Notify us promptly at{' '}
        <a href="mailto:support@justlucy.ai">support@justlucy.ai</a> if you suspect unauthorized use.
      </p>

      <h2>Acceptable use</h2>
      <p>You agree not to use the Service to:</p>
      <ul>
        <li>break any law or infringe anyone&rsquo;s rights;</li>
        <li>generate or distribute unlawful, harmful, harassing, or deceptive content;</li>
        <li>attempt to disrupt, overload, reverse-engineer, or gain unauthorized access to the Service;</li>
        <li>violate the usage policies of any AI provider or third-party service you connect.</li>
      </ul>

      <h2>Your content</h2>
      <p>
        You retain ownership of the content you submit (your prompts, messages, files, and
        configurations). You grant us a limited license to process and store that content solely to
        operate and provide the Service to you. You are responsible for your content and for having the
        rights to use it.
      </p>

      <h2>Bring-your-own-key and third-party services</h2>
      <p>
        Lucy lets you connect your own AI provider keys and third-party accounts. You are responsible
        for those keys, for any usage charges billed by your providers, and for complying with those
        providers&rsquo; terms. Third-party services are operated by their respective owners, and we are
        not responsible for them.
      </p>

      <h2>AI output</h2>
      <p>
        Lucy uses AI models that can produce inaccurate or incomplete information. Output is provided
        for your convenience and is not professional (legal, medical, financial, or other) advice. You
        are responsible for reviewing and verifying any output before relying on it.
      </p>

      <h2>Intellectual property</h2>
      <p>
        The open-source Lucy core is made available under its published open-source license. The hosted
        Service, the JustLucy name and marks, and our enterprise features are owned by us and are
        protected by intellectual-property laws. These Terms do not grant you rights to our trademarks.
      </p>

      <h2>Paid plans</h2>
      <p>
        If you purchase a paid plan, billing and payment terms are described on our{' '}
        <a href="/payments">Payments</a> page and any plan-specific terms presented at checkout.
      </p>

      <h2>Disclaimer</h2>
      <p>
        The Service is provided “as is” and “as available”, without warranties of any kind, whether
        express or implied, including fitness for a particular purpose and non-infringement. We do not
        warrant that the Service will be uninterrupted, secure, or error-free.
      </p>

      <h2>Limitation of liability</h2>
      <p>
        To the maximum extent permitted by law, JustLucy will not be liable for any indirect,
        incidental, special, consequential, or punitive damages, or for any loss of data, profits, or
        goodwill. Our total liability for any claim relating to the Service will not exceed the greater
        of the amount you paid us in the twelve months before the claim or USD 100.
      </p>

      <h2>Termination</h2>
      <p>
        You may stop using the Service and delete your account at any time. We may suspend or terminate
        your access if you violate these Terms or to protect the Service or other users.
      </p>

      <h2>Governing law</h2>
      <p>
        These Terms are governed by the laws of Croatia, without regard to conflict-of-law rules. The
        courts located in Croatia will have jurisdiction over disputes, except where applicable law
        gives you the right to bring proceedings elsewhere.
      </p>

      <h2>Changes to these Terms</h2>
      <p>
        We may update these Terms from time to time. We will post the updated version here and revise
        the “Last updated” date above. Your continued use of the Service after changes take effect
        constitutes acceptance of the updated Terms.
      </p>
    </LegalLayout>
  );
}
