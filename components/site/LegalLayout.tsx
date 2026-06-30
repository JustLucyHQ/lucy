import type { ReactNode } from 'react';
import { SiteHeader } from '@/components/site/SiteHeader';
import { SiteFooter } from '@/components/site/SiteFooter';

/**
 * Shared chrome for the public legal pages (privacy, terms, payments).
 * Reuses the marketing header/footer and styles the article's descendants
 * via Tailwind arbitrary variants so each page is plain semantic markup.
 */
export function LegalLayout({
  title,
  updated,
  intro,
  children,
}: {
  title: string;
  updated: string;
  intro?: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gray-950 text-gray-300">
      <SiteHeader />
      <main className="max-w-3xl mx-auto px-6 py-12 sm:py-16">
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">{title}</h1>
        <p className="mt-2 text-sm text-gray-500">Last updated: {updated}</p>
        {intro ? <p className="mt-6 text-gray-400 leading-relaxed">{intro}</p> : null}
        <article
          className="mt-8 space-y-5 leading-relaxed text-gray-400
            [&_h2]:text-white [&_h2]:text-xl [&_h2]:font-bold [&_h2]:mt-10 [&_h2]:mb-3
            [&_h3]:text-gray-200 [&_h3]:font-semibold [&_h3]:mt-6 [&_h3]:mb-2
            [&_a]:text-violet-400 [&_a:hover]:text-violet-300 [&_a]:underline [&_a]:underline-offset-2
            [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:space-y-1.5 [&_ul]:my-3
            [&_strong]:text-gray-200 [&_strong]:font-semibold"
        >
          {children}
        </article>
        <p className="mt-12 text-sm text-gray-500">
          Questions? Contact us at{' '}
          <a href="mailto:contact@justlucy.ai" className="text-violet-400 hover:text-violet-300 underline underline-offset-2">
            contact@justlucy.ai
          </a>
          .
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}
