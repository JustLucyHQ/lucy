'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { User, Shield, CreditCard } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

const SECTIONS: [string, string, LucideIcon][] = [
  ['/account/profile', 'Profile', User],
  ['/account/security', 'Security', Shield],
  ['/account/billing', 'Billing', CreditCard],
];

export function AccountNav() {
  const pathname = usePathname();
  return (
    <nav className="w-44 shrink-0 space-y-1" aria-label="Account sections">
      {SECTIONS.map(([href, label, Icon]) => (
        <Link
          key={href}
          href={href}
          aria-current={pathname === href ? 'page' : undefined}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-theme text-sm ${
            pathname === href
              ? 'bg-accent/20 text-t1 font-semibold'
              : 'text-t2 hover:text-t1 hover:bg-raised/60'
          }`}
        >
          <Icon className="w-4 h-4 shrink-0" />
          {label}
        </Link>
      ))}
    </nav>
  );
}
