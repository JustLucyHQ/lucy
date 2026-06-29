'use client';
import React, { useState } from 'react';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

export function AppShell({ title, children, padded = true }: { title: string; children: React.ReactNode; padded?: boolean; }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  return (
    <div className="h-full flex bg-bg">
      <Sidebar open={sidebarOpen} />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar title={title} sidebarOpen={sidebarOpen} onToggleSidebar={() => setSidebarOpen((v) => !v)} />
        <main className={padded ? 'flex-1 overflow-y-auto p-6' : 'flex-1 min-h-0'}>{children}</main>
      </div>
    </div>
  );
}
