import Link from 'next/link';
import { DocsNav } from '@/components/docs/DocsNav';
import { LucyMark } from '@/components/brand/LucyMark';
import { GitHubIcon } from '@/components/landing/GitHubIcon';
import { GITHUB_URL } from '@/components/landing/features';

export const metadata = {
  title: 'Lucy AI — Documentation',
  description: 'Knowledge base for Lucy users and developers: chat, memory, connectors, self-hosting, API, and more.',
};

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-bg text-t1 font-sans">
      {/* Top bar */}
      <header className="sticky top-0 z-20 h-14 border-b border-edge bg-surface/95 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-6 h-full flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2.5">
            <LucyMark className="w-7 h-7" />
            <span className="font-extrabold text-t1 text-sm tracking-tight">Lucy AI</span>
          </Link>
          <span className="text-t3 text-sm">/</span>
          <span className="text-sm font-semibold text-t2">Docs</span>
          <div className="ml-auto flex items-center gap-3">
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 text-sm font-medium text-t2 hover:text-t1 transition-colors"
            >
              <GitHubIcon className="w-4 h-4" /> GitHub
            </a>
            <Link
              href="/chat"
              className="text-xs font-semibold text-white bg-accent hover:bg-accent-soft rounded-theme px-3.5 py-2 transition-colors"
            >
              Open app
            </Link>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-10 flex gap-10">
        <aside className="hidden md:block sticky top-24 self-start max-h-[calc(100vh-7rem)] overflow-y-auto">
          <DocsNav />
        </aside>
        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
  );
}
