import Link from 'next/link';
import { XIcon, FacebookIcon } from '@/components/landing/SocialIcons';
import { GitHubIcon } from '@/components/landing/GitHubIcon';
import { GITHUB_URL, FOOTER_BADGES } from '@/components/landing/features';

const SOCIALS = [
  { href: 'https://twitter.com/justlucyai', label: 'Lucy on X (Twitter)', Icon: XIcon },
  { href: 'https://www.facebook.com/justlucyai/', label: 'Lucy on Facebook', Icon: FacebookIcon },
  { href: GITHUB_URL, label: 'Lucy on GitHub', Icon: GitHubIcon },
];

const LINKS = [
  { href: '/download', label: 'Download' },
  { href: '/docs', label: 'Docs' },
  { href: '/privacy', label: 'Privacy' },
  { href: '/terms', label: 'Terms' },
  { href: '/payments', label: 'Payments' },
];

/** Global site footer — used on the home page, download page, and future pages. */
export function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="relative z-10 border-t border-white/[0.07]">
      <div className="max-w-6xl mx-auto px-6 py-10">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 mb-8">
          {FOOTER_BADGES.map(([a, b]) => (
            <div key={a} className="text-center">
              <p className="text-sm font-bold text-white">{a}</p>
              <p className="text-xs text-gray-500">{b}</p>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-center gap-5 mb-6">
          {SOCIALS.map(({ href, label, Icon }) => (
            <a
              key={label}
              href={href}
              target="_blank"
              rel="noreferrer"
              aria-label={label}
              className="text-gray-500 hover:text-white transition-colors"
            >
              <Icon className="w-4 h-4" />
            </a>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs text-gray-500">
          <span>© {year} Lucy AI</span>
          {LINKS.map((l) => (
            <span key={l.href} className="flex items-center gap-4">
              <span aria-hidden>·</span>
              <Link href={l.href} className="hover:text-gray-300 transition-colors">
                {l.label}
              </Link>
            </span>
          ))}
        </div>
      </div>
    </footer>
  );
}
