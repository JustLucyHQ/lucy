import type { Metadata } from 'next';
import { LegalLayout } from '@/components/site/LegalLayout';

export const metadata: Metadata = {
  title: 'Payments — Lucy AI',
  description: 'Accepted payment methods, billing, and refunds for Lucy (justlucy.ai).',
};

const UPDATED = 'June 30, 2026';

export default function PaymentsPage() {
  return (
    <LegalLayout
      title="Payments"
      updated={UPDATED}
      intro="This page explains how payments work for paid plans on Lucy (justlucy.ai). We take the security of your payment information seriously and never store your card details on our systems."
    >
      <h2>Accepted payment methods</h2>
      <p>For paid plans, we accept:</p>
      <ul>
        <li><strong>Credit and debit cards</strong>, processed securely by Stripe.</li>
        <li><strong>PayPal.</strong></li>
      </ul>

      <h2>Secure processing</h2>
      <p>
        Card payments are handled by <a href="https://stripe.com" target="_blank" rel="noreferrer">Stripe</a>,
        which encrypts your card details during transmission and is certified to the highest level of
        payment-industry security (PCI DSS). <strong>We do not store any credit-card information on our
        systems.</strong> When you pay with PayPal, your financial details stay with PayPal and are
        never shared with us.
      </p>

      <h2>Billing</h2>
      <p>
        Paid plans are billed in advance on a recurring basis (for example monthly or annually,
        depending on the plan you choose). The price, billing period, and any applicable taxes are
        shown before you confirm a purchase. Subscriptions renew automatically until you cancel, and you
        can cancel at any time from your account settings; cancellation stops future charges.
      </p>

      <h2>Bring-your-own-key usage costs</h2>
      <p>
        Lucy lets you use your own AI provider keys. Any usage charges from those providers (for
        example OpenAI, Anthropic, or Google) are billed to you <strong>directly by the provider</strong>{' '}
        under your own account and are separate from any JustLucy subscription fee.
      </p>

      <h2>Refunds</h2>
      <p>
        If you are not satisfied, contact us at{' '}
        <a href="mailto:support@justlucy.ai">support@justlucy.ai</a> within 7 days of a charge and we
        will review your request for a refund. Refunds are issued to the original payment method.
      </p>

      <h2>Questions</h2>
      <p>
        For any billing question, reach us at{' '}
        <a href="mailto:support@justlucy.ai">support@justlucy.ai</a>.
      </p>
    </LegalLayout>
  );
}
