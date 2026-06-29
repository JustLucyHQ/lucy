import {
  resolveThemeAttrs,
  BRAND_THEMES,
  THEME_OPTIONS,
  applyThemeToDocument,
  persistThemeHint,
} from '@/lib/theme';

describe('persistThemeHint', () => {
  it('writes a hint the no-flash script can read (lucy-settings → state.theme)', () => {
    persistThemeHint('industrial');
    const parsed = JSON.parse(localStorage.getItem('lucy-settings') as string);
    expect(parsed.state.theme).toBe('industrial');
  });
});

describe('resolveThemeAttrs', () => {
  it('maps light to light class and no data-theme', () => {
    expect(resolveThemeAttrs('light')).toEqual({ isDark: false, dataTheme: null });
  });

  it('maps minimal dark to dark class and no data-theme', () => {
    expect(resolveThemeAttrs('dark')).toEqual({ isDark: true, dataTheme: null });
  });

  it('maps each brand theme to dark class + its data-theme', () => {
    for (const t of BRAND_THEMES) {
      expect(resolveThemeAttrs(t)).toEqual({ isDark: true, dataTheme: t });
    }
  });

  it('falls back to minimal dark for unknown or missing values', () => {
    expect(resolveThemeAttrs(undefined)).toEqual({ isDark: true, dataTheme: null });
    expect(resolveThemeAttrs('neon-zebra')).toEqual({ isDark: true, dataTheme: null });
  });

  it('exposes picker options for all five themes', () => {
    expect(THEME_OPTIONS.map((o) => o.id)).toEqual([
      'luminous', 'industrial', 'editorial', 'dark', 'light',
    ]);
  });
});

describe('applyThemeToDocument', () => {
  it('sets dark class and data-theme for a brand theme', () => {
    applyThemeToDocument('luminous');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.getAttribute('data-theme')).toBe('luminous');
  });

  it('removes data-theme when switching to light', () => {
    applyThemeToDocument('industrial');
    applyThemeToDocument('light');
    expect(document.documentElement.classList.contains('light')).toBe(true);
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(document.documentElement.getAttribute('data-theme')).toBeNull();
  });

  it('removes data-theme when switching to minimal dark', () => {
    applyThemeToDocument('editorial');
    applyThemeToDocument('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBeNull();
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });
});
