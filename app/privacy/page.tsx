import type { Metadata } from 'next';
import { LegalLayout } from '@/components/site/LegalLayout';

export const metadata: Metadata = {
  title: 'Privacy Policy — Lucy AI',
  description:
    'How JustLucy (justlucy.ai) collects, uses, stores, and protects your data, including data accessed through Google and other connected services.',
};

const UPDATED = 'June 30, 2026';

export default function PrivacyPage() {
  return (
    <LegalLayout
      title="Privacy Policy"
      updated={UPDATED}
      intro="This Privacy Policy explains how JustLucy (“Lucy”, “we”, “us”) collects, uses, stores, and protects your information when you use the Lucy application and the website at justlucy.ai (the “Service”). By using the Service you agree to the practices described here."
    >
      <h2>Who we are</h2>
      <p>
        The Service is operated by JustLucy. For privacy questions, contact us at{' '}
        <a href="mailto:contact@justlucy.ai">contact@justlucy.ai</a>. For users in the EEA/UK,
        JustLucy is the data controller for the personal data described below.
      </p>

      <h2>Information we collect</h2>
      <ul>
        <li>
          <strong>Account information</strong> — your email address and name when you register or
          sign in (including via Google sign-in). Passwords are stored only as salted hashes.
        </li>
        <li>
          <strong>Content you create</strong> — your chats and messages, the memories Lucy keeps to
          personalize your experience, personas, workflows, and any knowledge or files you add.
        </li>
        <li>
          <strong>Provider &amp; integration credentials</strong> — API keys for the AI providers you
          choose to use, and access tokens for services you connect (e.g. Google, Microsoft, Slack).
          These are <strong>encrypted at rest</strong> and used only to perform the actions you request.
        </li>
        <li>
          <strong>Usage &amp; device data</strong> — basic logs, approximate device/browser
          information, and security events (such as sign-in activity and two-factor status) needed to
          operate and secure the Service.
        </li>
      </ul>

      <h2>How we use your information</h2>
      <ul>
        <li>To provide, maintain, and secure the Service and your account.</li>
        <li>To personalize Lucy using your memories and preferences.</li>
        <li>To authenticate you and enforce security features such as two-factor authentication.</li>
        <li>To carry out the actions and integrations you explicitly request.</li>
        <li>To communicate with you about your account, security, and support.</li>
        <li>To comply with legal obligations and enforce our Terms.</li>
      </ul>
      <p>We do not sell your personal data, and we do not use it to serve third-party advertising.</p>

      <h2>AI providers and your prompts</h2>
      <p>
        Lucy is a “bring-your-own-key” assistant: when you send a message, your prompt and the context
        needed to answer it are transmitted to the AI provider you have configured (for example OpenAI,
        Anthropic, or Google) — or to a local model on your own machine if you choose one. Your use of
        those providers is also governed by their respective privacy policies and terms. We do not use
        your content to train our own models.
      </p>

      <h2>Connected services and Google user data</h2>
      <p>
        When you connect a third-party account (such as Google, Microsoft, or Slack), you authorize
        specific permissions (scopes). Lucy accesses that data <strong>only</strong> to provide the
        features you ask for — for example, searching your Google Drive, drafting an email, or checking
        your calendar — and stores the access tokens in encrypted form. You can disconnect any service
        at any time from Settings, which revokes Lucy&rsquo;s access.
      </p>
      <p>
        <strong>
          Lucy&rsquo;s use and transfer of information received from Google APIs adheres to the{' '}
          <a
            href="https://developers.google.com/terms/api-services-user-data-policy"
            target="_blank"
            rel="noreferrer"
          >
            Google API Services User Data Policy
          </a>
          , including the Limited Use requirements.
        </strong>{' '}
        Specifically, data obtained from Google is used only to provide or improve the user-facing
        features you request; it is never sold, never used for advertising, and never used to train
        generalized AI/ML models. We do not transfer this data to others except as necessary to provide
        the feature, to comply with applicable law, or as part of a merger or acquisition with prior
        notice. Human access to Google user data is not permitted except with your explicit consent,
        for security or to comply with law, or in aggregated/anonymized form for operations.
      </p>

      <h2>Service providers (subprocessors)</h2>
      <p>We rely on a small number of trusted providers to run the Service:</p>
      <ul>
        <li><strong>Hosting &amp; database</strong> — our self-hosted Supabase (PostgreSQL) infrastructure.</li>
        <li><strong>AI providers</strong> — the model providers you configure, to generate responses.</li>
        <li><strong>Email</strong> — our transactional email provider, for account and security emails.</li>
        <li><strong>Payments</strong> — Stripe and PayPal process payments where you purchase a paid plan (see our <a href="/payments">Payments</a> page).</li>
      </ul>

      <h2>Data retention</h2>
      <p>
        We retain your account data and content for as long as your account is active or as needed to
        provide the Service. You may request deletion of your account and associated data at any time;
        we will delete or anonymize it except where we must retain certain records to comply with law.
      </p>

      <h2>Security</h2>
      <p>
        We protect your data with encryption in transit (HTTPS) and encryption at rest for sensitive
        secrets such as API keys and integration tokens, along with access controls and authentication
        safeguards. No method of transmission or storage is completely secure, but we work to protect
        your information using industry-standard measures.
      </p>

      <h2>Your rights</h2>
      <p>
        Depending on where you live, you may have the right to access, correct, export, restrict, or
        delete your personal data, and to object to certain processing. EEA/UK users have these rights
        under the GDPR; California residents have rights under the CCPA/CPRA, including the right to
        know and to delete and the right not to be discriminated against for exercising them. To
        exercise any right, contact <a href="mailto:contact@justlucy.ai">contact@justlucy.ai</a>.
      </p>

      <h2>International transfers</h2>
      <p>
        Your data may be processed in countries other than your own. Where required, we use appropriate
        safeguards for such transfers.
      </p>

      <h2>Children&rsquo;s privacy</h2>
      <p>
        The Service is not directed to children under 16, and we do not knowingly collect personal data
        from them. If you believe a child has provided us data, contact us and we will delete it.
      </p>

      <h2>Changes to this policy</h2>
      <p>
        We may update this Privacy Policy from time to time. We will post the updated version here and
        revise the “Last updated” date above; significant changes may also be communicated by email.
      </p>
    </LegalLayout>
  );
}
