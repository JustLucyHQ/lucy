/**
 * Theme model. Five themes: three brand themes (dark-based, set data-theme),
 * plus the legacy minimal dark and light.
 *
 * NOTE: the no-flash inline script in app/layout.tsx duplicates this logic
 * as a plain string (it runs before any module loads). Keep them in sync.
 */

export const BRAND_THEMES = ['luminous', 'industrial', 'editorial'] as const;
export type BrandTheme = (typeof BRAND_THEMES)[number];
export type Theme = 'light' | 'dark' | BrandTheme;

export const DEFAULT_THEME: Theme = 'luminous';

export interface ThemeAttrs {
  isDark: boolean;
  dataTheme: BrandTheme | null;
}

export function isBrandTheme(t: string): t is BrandTheme {
  return (BRAND_THEMES as readonly string[]).includes(t);
}

export function resolveThemeAttrs(theme: string | undefined | null): ThemeAttrs {
  if (theme === 'light') return { isDark: false, dataTheme: null };
  if (theme && isBrandTheme(theme)) return { isDark: true, dataTheme: theme };
  return { isDark: true, dataTheme: null };
}

/**
 * Mirror the active theme into localStorage so the pre-hydration no-flash
 * script in app/layout.tsx can read it. The settings store persists through
 * the StorageAdapter (different key / database), which the inline script
 * cannot reach — without this hint every page load would flash the default.
 */
export function persistThemeHint(theme: string): void {
  try {
    localStorage.setItem('lucy-settings', JSON.stringify({ state: { theme } }));
  } catch {
    // localStorage unavailable (private mode) — flash prevention degrades
  }
}

/** Apply class + data-theme to <html>. Used by ThemeProvider. */
export function applyThemeToDocument(theme: string | undefined | null): void {
  const root = document.documentElement;
  const { isDark, dataTheme } = resolveThemeAttrs(theme);
  root.classList.toggle('dark', isDark);
  root.classList.toggle('light', !isDark);
  if (dataTheme) root.setAttribute('data-theme', dataTheme);
  else root.removeAttribute('data-theme');
}

/** Picker metadata for Settings → General. */
export const THEME_OPTIONS: { id: Theme; label: string; blurb: string }[] = [
  { id: 'luminous', label: 'Luminous', blurb: 'Glassy purple glow — the default' },
  { id: 'industrial', label: 'Industrial', blurb: 'Sharp edges, strong borders' },
  { id: 'editorial', label: 'Editorial', blurb: 'Bold type, stark contrast' },
  { id: 'dark', label: 'Minimal dark', blurb: 'The classic Lucy dark' },
  { id: 'light', label: 'Light', blurb: 'Plain light mode' },
];
