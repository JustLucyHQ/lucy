import Link from 'next/link';
import { LucyMark } from '@/components/brand/LucyMark';
import { GitHubIcon } from '@/components/landing/GitHubIcon';
import { NavCta } from '@/components/landing/NavCta';
import { GITHUB_URL } from '@/components/landing/features';

/** Global site header — used on the home page, download page, and future pages. */
export function SiteHeader() {
  return (
    <header className="relative z-10">
      <nav className="max-w-6xl mx-auto px-6 flex items-center justify-between py-6">
        <Link href="/" className="flex items-center gap-2.5">
          <LucyMark className="w-8 h-8 rounded-xl shadow-[0_0_14px_rgba(139,92,246,0.5)]" />
          <span className="hidden sm:inline text-lg font-extrabold tracking-tight">
            <span className="text-gray-500">Just</span> <span className="text-white">Lucy</span>
          </span>
        </Link>
        <div className="flex items-center gap-4">
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 text-sm font-medium text-gray-400 hover:text-white transition-colors"
          >
            <GitHubIcon className="w-4 h-4" /> GitHub
          </a>
          <NavCta />
        </div>
      </nav>
    </header>
  );
}
