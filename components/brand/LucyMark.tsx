import React from 'react';

/**
 * Lucy primary mark — the gradient hook + dot on a rounded purple square.
 * The brand's app-icon form (matches public/brand/favicon.svg). Sized via
 * `className`; the gradient id is unique so multiple instances don't collide.
 */
export function LucyMark({ className = 'w-7 h-7', title }: { className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} role="img" aria-label={title ?? 'Lucy'} xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="lucy-mark-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#a855f7" />
          <stop offset="1" stopColor="#6d28d9" />
        </linearGradient>
      </defs>
      <rect width="100" height="100" rx="27" fill="url(#lucy-mark-grad)" />
      <path d="M40 27 V57 C40 69 51 71 62 64" fill="none" stroke="#fff" strokeWidth="11" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="64" cy="39" r="5" fill="#fff" />
    </svg>
  );
}
