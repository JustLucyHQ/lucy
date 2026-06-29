import { siApple, siLinux } from 'simple-icons';

type OS = 'windows' | 'mac' | 'linux';

/**
 * OS logos for the download cards. Apple + Linux (Tux) come from simple-icons;
 * Windows isn't in simple-icons, so its four-pane flag is drawn inline. All use
 * currentColor so they inherit the card's text colour.
 */
export function OsIcon({ os, className = 'w-6 h-6' }: { os: OS; className?: string }) {
  if (os === 'mac') {
    return (
      <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
        <path d={siApple.path} />
      </svg>
    );
  }
  if (os === 'linux') {
    return (
      <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
        <path d={siLinux.path} />
      </svg>
    );
  }
  // Windows — geometric four-pane flag.
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801" />
    </svg>
  );
}
