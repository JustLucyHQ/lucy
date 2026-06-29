'use client';
import React from 'react';
import { PanelLeftClose, PanelLeftOpen, Sun, Moon } from 'lucide-react';
import { useSettingsStore } from '@/lib/store/settings';
import { useStorage } from '@/lib/storage/provider';

/**
 * Top bar: sidebar toggle, page title, quick theme toggle.
 * The user/account menu lives in the Sidebar's bottom-left UserSection.
 */
export function Topbar({ title, sidebarOpen, onToggleSidebar }: { title: string; sidebarOpen: boolean; onToggleSidebar: () => void; }) {
  const { theme, setTheme } = useSettingsStore();
  const adapter = useStorage();

  return (
    <header className="h-14 border-b border-edge bg-surface/95 backdrop-blur-sm flex items-center px-4 gap-3 shrink-0 z-10 relative">
      <button onClick={onToggleSidebar} className="p-1.5 rounded-md text-t2 hover:text-t1 hover:bg-raised transition-colors" aria-label="Toggle sidebar">
        {sidebarOpen ? <PanelLeftClose className="w-5 h-5" /> : <PanelLeftOpen className="w-5 h-5" />}
      </button>
      <h1 className="text-sm font-medium text-t2 truncate">{title}</h1>
      <div className="ml-auto flex items-center gap-2">
        <button
          onClick={() => setTheme(theme === 'light' ? 'luminous' : 'light', adapter)}
          className="p-1.5 rounded-md text-t2 hover:text-t1 hover:bg-raised transition-colors"
          aria-label="Toggle theme"
        >
          {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
        </button>
      </div>
    </header>
  );
}
