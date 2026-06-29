import { SiteHeader } from './SiteHeader';
import { SiteFooter } from './SiteFooter';

/**
 * Page shell with the global background, header, and footer. Use for simple
 * pages (download, terms, privacy, …); the home page keeps its own richer
 * atmosphere but reuses SiteHeader / SiteFooter directly.
 */
export function SiteShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#0c0a16] text-gray-200 font-sans overflow-x-hidden flex flex-col">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 bg-[radial-gradient(60%_50%_at_50%_0%,rgba(139,92,246,0.12),transparent_70%)]"
      />
      <SiteHeader />
      <main className="relative z-10 flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}
