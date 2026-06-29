'use client';
import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  MessageSquare, Drama, Workflow, Plug, MessagesSquare, Settings as Cog, ShieldCheck, Lock,
  ChevronUp, LogOut, LogIn, UserRound, Compass,
} from 'lucide-react';
import { useIsAdmin } from '@/lib/hooks/useIsAdmin';
import { useAuth } from '@/lib/supabase/auth';
import { LucyMark } from '@/components/brand/LucyMark';

interface NavItem { href: string; label: string; icon: React.ElementType; admin?: boolean; }

const NAV: NavItem[] = [
  { href: '/chat', label: 'Chat', icon: MessageSquare },
  { href: '/personas', label: 'Personas', icon: Drama },
  { href: '/workflows', label: 'Workflows', icon: Workflow },
  { href: '/connectors', label: 'Connectors', icon: Plug },
  { href: '/widgets', label: 'Chat Widgets', icon: MessagesSquare },
];
const MANAGE: NavItem[] = [
  { href: '/settings', label: 'Settings', icon: Cog },
  { href: '/admin', label: 'Admin', icon: ShieldCheck, admin: true },
];

function NavItemRow({ item, open, active, locked }: { item: NavItem; open: boolean; active: boolean; locked: boolean }) {
  const cls = `flex items-center gap-3 px-3 py-2 rounded-theme text-sm transition-colors ${
    active ? 'bg-lucy-700/30 text-t1' : 'text-t3 hover:text-t2 hover:bg-raised/60'
  } ${locked ? 'opacity-50 cursor-not-allowed' : ''}`;
  const inner = (
    <>
      <item.icon className="w-4 h-4 shrink-0" />
      {open && <span className="truncate">{item.label}</span>}
      {locked && open && <Lock className="w-3 h-3 ml-auto opacity-70" />}
    </>
  );
  if (locked) return <div className={cls} title="Admin access required" aria-disabled={true}>{inner}</div>;
  return <Link href={item.href} className={cls} aria-current={active ? 'page' : undefined}>{inner}</Link>;
}

/** Bottom-left user section: avatar + name with an upward menu (Account, Setup guide, Sign out). */
function UserSection({ open }: { open: boolean }) {
  const { user, signOut, authEnabled } = useAuth();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);

  if (!authEnabled) return null;

  if (!user) {
    return (
      <div className="border-t border-edge p-2">
        <Link
          href="/auth/login"
          className="flex items-center gap-2.5 px-2 py-2 rounded-theme text-sm text-t2 hover:text-t1 hover:bg-raised/60 transition-colors"
        >
          <LogIn className="w-4 h-4 shrink-0" />
          {open && <span>Sign in</span>}
        </Link>
      </div>
    );
  }

  const displayName =
    (user.user_metadata?.display_name as string | undefined) ||
    user.email?.split('@')[0] ||
    'Account';
  const initial = (displayName[0] || 'L').toUpperCase();

  const handleSignOut = async () => {
    setMenuOpen(false);
    await signOut();
    router.push('/auth/login');
  };

  return (
    <div className="relative border-t border-edge p-2">
      <button
        onClick={() => setMenuOpen((v) => !v)}
        className="w-full flex items-center gap-2.5 px-2 py-2 rounded-theme hover:bg-raised/60 transition-colors text-left"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-label="Account menu"
      >
        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-lucy-400 to-lucy-700 shadow-glow-sm flex items-center justify-center text-white text-xs font-bold shrink-0">
          {initial}
        </div>
        {open && (
          <span className="flex-1 min-w-0">
            <span className="block text-xs font-semibold text-t1 truncate">{displayName}</span>
            <span className="block text-[10px] text-t3 truncate">{user.email}</span>
          </span>
        )}
        {open && (
          <ChevronUp
            className={`w-3.5 h-3.5 text-t3 shrink-0 transition-transform ${menuOpen ? '' : 'rotate-180'}`}
          />
        )}
      </button>

      {menuOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
          <div
            role="menu"
            className="absolute bottom-full left-2 mb-1.5 w-52 z-20 bg-surface border border-edge rounded-theme shadow-xl py-1"
          >
            <div className="px-3 py-2 border-b border-edge">
              <p className="text-xs font-semibold text-t1 truncate">{displayName}</p>
              <p className="text-[10px] text-t3 truncate">{user.email}</p>
            </div>
            <Link
              href="/account/profile"
              onClick={() => setMenuOpen(false)}
              className="flex items-center gap-2 px-3 py-2 text-xs text-t2 hover:text-t1 hover:bg-raised transition-colors"
            >
              <UserRound className="w-3.5 h-3.5" /> Account
            </Link>
            <Link
              href="/onboarding"
              onClick={() => setMenuOpen(false)}
              className="flex items-center gap-2 px-3 py-2 text-xs text-t2 hover:text-t1 hover:bg-raised transition-colors"
            >
              <Compass className="w-3.5 h-3.5" /> Setup guide
            </Link>
            <button
              onClick={handleSignOut}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-t2 hover:text-red-400 hover:bg-raised transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" /> Sign out
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export function Sidebar({ open }: { open: boolean }) {
  const pathname = usePathname();
  const isAdmin = useIsAdmin();
  const active = (href: string) => pathname === href || pathname.startsWith(href + '/');

  return (
    <aside className={`${open ? 'w-60' : 'w-14'} shrink-0 border-r border-edge bg-surface flex flex-col transition-[width] duration-200`}>
      <Link href="/chat" className="flex items-center gap-2 h-14 px-3 border-b border-edge">
        <LucyMark className="w-7 h-7 shrink-0" />
        {open && <span className="font-semibold text-t1 text-sm tracking-tight">Lucy</span>}
      </Link>
      <nav className="flex-1 p-2 space-y-1" aria-label="Primary">
        {NAV.map((i) => <NavItemRow key={i.href} item={i} open={open} active={active(i.href)} locked={Boolean(i.admin && !isAdmin)} />)}
        <div className="h-px bg-edge my-2" />
        {MANAGE.map((i) => <NavItemRow key={i.href} item={i} open={open} active={active(i.href)} locked={Boolean(i.admin && !isAdmin)} />)}
      </nav>
      <UserSection open={open} />
    </aside>
  );
}
