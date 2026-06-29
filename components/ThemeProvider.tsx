'use client';

import { useEffect } from 'react';
import { useSettingsStore } from '@/lib/store/settings';
import { applyThemeToDocument, persistThemeHint } from '@/lib/theme';

/**
 * Applies the current theme (class + data-theme attribute) to <html>
 * whenever the zustand settings store's theme value changes, and mirrors it
 * to localStorage for the pre-hydration no-flash script.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useSettingsStore((s) => s.theme);

  useEffect(() => {
    applyThemeToDocument(theme);
    persistThemeHint(theme);
  }, [theme]);

  return <>{children}</>;
}
