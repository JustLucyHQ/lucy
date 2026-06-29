'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Database, HardDrive, ShieldCheck, Shield } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { AdminMemoryPanel } from '@/components/settings/AdminMemoryPanel';
import { TelegramPanel } from '@/components/admin/TelegramPanel';
import { Badge } from '@/components/ui/Badge';
import { useStorageMode } from '@/lib/storage/provider';

interface RoleUser {
  id: string;
  email: string;
  role: 'admin' | 'member';
  created_at: string | null;
}

function UserRolesCard() {
  const [users, setUsers] = useState<RoleUser[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    fetch('/api/admin/roles')
      .then((r) => r.json())
      .then((d) => setUsers(d.users ?? []))
      .catch(() => setError('Failed to load users'));

  useEffect(() => {
    load();
  }, []);

  const toggleRole = async (u: RoleUser) => {
    setBusyId(u.id);
    setError(null);
    try {
      const res = await fetch('/api/admin/roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: u.id, role: u.role === 'admin' ? 'member' : 'admin' }),
      });
      const d = await res.json();
      if (!res.ok) setError(d.error ?? 'Update failed');
      await load();
    } catch {
      setError('Update failed');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="p-4 rounded-lg bg-gray-900 border border-gray-800 space-y-3">
      <p className="text-xs text-gray-500">
        Admins can change global settings (memory, embedder, retention) and manage roles.
        The role is stored in Supabase auth metadata — users cannot change it themselves.
      </p>
      {error && (
        <div className="text-xs text-red-400 bg-red-950/50 border border-red-900 rounded px-2 py-1.5">
          {error}
        </div>
      )}
      <ul className="divide-y divide-gray-800">
        {users.map((u) => (
          <li key={u.id} className="flex items-center justify-between py-2 gap-3">
            <div className="flex items-center gap-2 min-w-0">
              {u.role === 'admin' ? (
                <ShieldCheck className="w-4 h-4 text-lucy-400 shrink-0" />
              ) : (
                <Shield className="w-4 h-4 text-gray-600 shrink-0" />
              )}
              <span className="text-sm text-gray-200 truncate">{u.email || u.id}</span>
              <Badge variant={u.role === 'admin' ? 'success' : 'default'}>{u.role}</Badge>
            </div>
            <button
              onClick={() => toggleRole(u)}
              disabled={busyId === u.id}
              className="text-xs px-2.5 py-1 rounded-md border border-gray-700 text-gray-300 hover:text-white hover:bg-gray-800 transition-colors disabled:opacity-50 shrink-0"
            >
              {busyId === u.id ? '…' : u.role === 'admin' ? 'Remove admin' : 'Make admin'}
            </button>
          </li>
        ))}
        {users.length === 0 && !error && (
          <li className="py-2 text-xs text-gray-600">Loading users…</li>
        )}
      </ul>
    </div>
  );
}

function StorageModeCard() {
  const storageMode = useStorageMode();
  return (
    <div className="p-4 rounded-lg bg-gray-900 border border-gray-800">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {storageMode === 'supabase' ? (
            <Database className="w-5 h-5 text-lucy-400" />
          ) : (
            <HardDrive className="w-5 h-5 text-gray-400" />
          )}
          <div>
            <div className="text-sm font-medium text-white">
              {storageMode === 'supabase' ? 'Supabase (Connected)' : 'Local Storage (Standalone)'}
            </div>
            <div className="text-xs text-gray-500">
              {storageMode === 'supabase'
                ? 'Your data is synced to Supabase PostgreSQL and accessible across devices.'
                : 'Your data is stored in browser localStorage. Set NEXT_PUBLIC_SUPABASE_URL to enable cloud sync.'}
            </div>
          </div>
        </div>
        <Badge variant={storageMode === 'supabase' ? 'success' : 'default'}>
          {storageMode === 'supabase' ? 'Connected' : 'Standalone'}
        </Badge>
      </div>
    </div>
  );
}

export default function AdminPage() {
  const router = useRouter();
  const [checked, setChecked] = useState(false);
  useEffect(() => {
    fetch('/api/admin/me').then((r) => r.json()).then((d) => {
      if (!d?.isAdmin) router.replace('/chat'); else setChecked(true);
    }).catch(() => router.replace('/chat'));
  }, [router]);
  if (!checked) return <AppShell title="Admin"><p className="text-sm text-gray-500">Checking access…</p></AppShell>;
  return (
    <AppShell title="Admin">
      <div className="max-w-3xl mx-auto space-y-8">
        <section>
          <h2 className="text-sm font-medium text-white mb-2">Memory</h2>
          <AdminMemoryPanel />
        </section>
        <section>
          <h2 className="text-sm font-medium text-white mb-2">Users &amp; roles</h2>
          <UserRolesCard />
        </section>
        <section>
          <h2 className="text-sm font-medium text-white mb-2">Channels</h2>
          <TelegramPanel />
        </section>
        <section>
          <h2 className="text-sm font-medium text-white mb-2">Deployment</h2>
          <StorageModeCard />
        </section>
      </div>
    </AppShell>
  );
}
