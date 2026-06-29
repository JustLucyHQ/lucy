import { AppShell } from '@/components/layout/AppShell';
import { SettingsNav } from '@/components/settings/SettingsNav';
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell title="Settings">
      <div className="max-w-4xl mx-auto flex gap-8">
        <SettingsNav />
        <div className="flex-1 min-w-0 space-y-6">{children}</div>
      </div>
    </AppShell>
  );
}
