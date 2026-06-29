import { AppShell } from '@/components/layout/AppShell';
import { AccountNav } from '@/components/account/AccountNav';

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell title="Account">
      <div className="max-w-4xl mx-auto flex gap-8">
        <AccountNav />
        <div className="flex-1 min-w-0 space-y-6">{children}</div>
      </div>
    </AppShell>
  );
}
