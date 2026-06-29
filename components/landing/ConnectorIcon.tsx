import { siGithub, siNotion, siPostgresql, siLinear, siStripe, siBrave } from 'simple-icons';
import { Hash, Folder, Globe, Plus, type LucideIcon } from 'lucide-react';

interface SimpleIcon {
  path: string;
  hex: string;
  title: string;
}

/** Real brand logos (simple-icons) for the company connectors. */
const BRAND: Record<string, SimpleIcon> = {
  GitHub: siGithub,
  Notion: siNotion,
  Postgres: siPostgresql,
  Linear: siLinear,
  Stripe: siStripe,
  'Brave Search': siBrave,
};

/** Generic icons for non-brand connectors (and Slack, which isn't in simple-icons). */
const GENERIC: Record<string, LucideIcon> = {
  Slack: Hash,
  Filesystem: Folder,
  Fetch: Globe,
  'Your own app': Plus,
};

/** Keep near-black brand colors visible on the dark tile by lightening them. */
function onDark(hex: string): string {
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return lum < 0.32 ? '#e5e7eb' : `#${hex}`;
}

/** Company/brand icon for a connector, styled to match the provider tiles under the chat. */
export function ConnectorIcon({ name, className = 'w-[18px] h-[18px]' }: { name: string; className?: string }) {
  const brand = BRAND[name];
  if (brand) {
    return (
      <svg viewBox="0 0 24 24" className={className} fill={onDark(brand.hex)} aria-hidden="true">
        <path d={brand.path} />
      </svg>
    );
  }
  const Generic = GENERIC[name];
  if (Generic) return <Generic className={`${className} text-lucy-300`} aria-hidden="true" />;
  return null;
}
