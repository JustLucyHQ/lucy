'use client';
import Script from 'next/script';
import { usePathname } from 'next/navigation';

/**
 * Google Analytics (gtag.js). Loads only when NEXT_PUBLIC_GA_ID is set AND the
 * visitor is on a **public marketing page** (landing, download, docs). The
 * internal app (chat, settings, workflows, embed, admin, …) is never tracked,
 * keeping product usage private. The ID is also cleared in the desktop build,
 * so the standalone app ships analytics-free.
 */
const PUBLIC_PREFIXES = ['/download', '/docs'];

function isPublicPage(pathname: string): boolean {
  if (pathname === '/') return true;
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

export function GoogleAnalytics() {
  const id = process.env.NEXT_PUBLIC_GA_ID;
  const pathname = usePathname();

  if (!id || !isPublicPage(pathname)) return null;

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${id}`}
        strategy="afterInteractive"
      />
      <Script id="gtag-init" strategy="afterInteractive">
        {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${id}');`}
      </Script>
    </>
  );
}
