import type { Metadata, Viewport } from 'next';
import { Manrope } from 'next/font/google';
import './globals.css';
import { StorageProvider } from '@/lib/storage/provider';
import { AuthProvider } from '@/lib/supabase/auth';
import { StoreSync } from '@/lib/store/StoreSync';
import { ThemeProvider } from '@/components/ThemeProvider';
import { GoogleAnalytics } from '@/components/analytics/GoogleAnalytics';

const manrope = Manrope({
  subsets: ['latin'],
  variable: '--font-manrope',
  display: 'swap',
});

// Canonical site URL — drives absolute OG/canonical/manifest URLs. Override
// per-environment with NEXT_PUBLIC_SITE_URL; defaults to the production domain.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://justlucy.ai';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: 'Lucy — AI Chat Platform',
  description: 'Multi-provider AI chat platform for company onboarding and productivity',
  manifest: '/manifest.json',
  openGraph: {
    title: 'Lucy — AI Chat Platform',
    description: 'Multi-provider AI chat platform for company onboarding and productivity',
    type: 'website',
    url: '/',
    siteName: 'Lucy',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Lucy',
  },
};

export const viewport: Viewport = {
  themeColor: '#8B5CF6',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`h-full ${manrope.variable}`} suppressHydrationWarning>
      <head>
        {/*
          Inline script that runs before React hydrates to set the correct theme
          class immediately, preventing a flash of wrong theme.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
(function() {
  // KEEP IN SYNC with lib/theme.ts (this runs before modules load)
  var BRAND = ['luminous', 'industrial', 'editorial'];
  var theme = 'luminous';
  try {
    var stored = localStorage.getItem('lucy-settings');
    if (stored) {
      var parsed = JSON.parse(stored);
      if (parsed && parsed.state && parsed.state.theme) theme = parsed.state.theme;
    }
  } catch (e) {}
  var isLight = theme === 'light';
  document.documentElement.classList.add(isLight ? 'light' : 'dark');
  if (BRAND.indexOf(theme) !== -1) document.documentElement.setAttribute('data-theme', theme);
})();
            `.trim(),
          }}
        />
      </head>
      <body className="h-full bg-bg text-t1 antialiased font-sans" suppressHydrationWarning>
        <GoogleAnalytics />
        <AuthProvider>
          <StorageProvider>
            <StoreSync />
            <ThemeProvider>
              {children}
            </ThemeProvider>
          </StorageProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
