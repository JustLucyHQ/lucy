import React from 'react';
import { isSafeLinkHref } from '@/lib/security/safe-link';

/**
 * Anchor renderer for markdown in chat. Only http(s)/mailto targets are clickable; anything else
 * (javascript:, data:, relative paths, unparsable) is shown as its plain text. External links open in a new tab
 * with noopener (no window.opener) + noreferrer + nofollow.
 */
export function SafeLink({
  href,
  children,
  className,
}: {
  href?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  if (!isSafeLinkHref(href)) return <>{children}</>;
  return (
    <a href={href.trim()} target="_blank" rel="noopener noreferrer nofollow" className={className}>
      {children}
    </a>
  );
}
