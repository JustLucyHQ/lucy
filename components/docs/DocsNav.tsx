'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { DOC_SECTIONS } from '@/lib/docs/registry';

export function DocsNav() {
  const pathname = usePathname();

  return (
    <nav className="w-56 shrink-0 space-y-6" aria-label="Documentation">
      {DOC_SECTIONS.map((section) => (
        <div key={section.title}>
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-t3 mb-2 px-3">
            {section.title}
          </p>
          <ul className="space-y-0.5">
            {section.pages.map((page) => {
              const href = `/docs/${page.slug}`;
              const active = pathname === href || (pathname === '/docs' && page.slug === 'introduction');
              return (
                <li key={page.slug}>
                  <Link
                    href={href}
                    aria-current={active ? 'page' : undefined}
                    className={`block px-3 py-1.5 rounded-theme text-sm transition-colors ${
                      active
                        ? 'bg-accent/15 text-t1 font-semibold'
                        : 'text-t2 hover:text-t1 hover:bg-raised/60'
                    }`}
                  >
                    {page.title}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
