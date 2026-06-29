'use client';
import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { User, Plug, Brain, KeyRound, Mic } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

const SECTIONS: [string, string, LucideIcon][] = [
  ['/settings/general', 'General', User],
  ['/settings/providers', 'Providers', Plug],
  ['/settings/memory', 'Memory', Brain],
  ['/settings/voice', 'Voice', Mic],
  ['/settings/api-access', 'API Access', KeyRound],
];

export function SettingsNav() {
  const pathname = usePathname();
  const [search, setSearch] = useState('');

  const filtered = SECTIONS.filter(([, label]) =>
    label.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <nav className="w-44 shrink-0 space-y-1" aria-label="Settings sections">
      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search…"
        className="w-full mb-2 bg-raised border border-edge-strong rounded px-2 py-1 text-xs text-t2 placeholder-t3 focus:outline-none focus:border-lucy-500"
      />
      {filtered.map(([href, label, Icon]) => (
        <Link
          key={href}
          href={href}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-theme text-sm ${
            pathname === href
              ? 'bg-lucy-700/30 text-t1'
              : 'text-t3 hover:text-t2 hover:bg-raised/60'
          }`}
        >
          <Icon className="w-4 h-4 shrink-0" />
          {label}
        </Link>
      ))}
    </nav>
  );
}
