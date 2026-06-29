'use client';

import { useState } from 'react';
import { connectorIconUrl } from '@/lib/mcp/icons';

/**
 * Renders a connector's real app logo (favicon by brand domain), falling back to
 * the catalog emoji if there's no domain or the image fails to load.
 */
export function ConnectorIcon({
  slug,
  emoji,
  imgClass = 'w-6 h-6',
  emojiClass = 'text-xl',
}: {
  slug: string;
  emoji?: string;
  imgClass?: string;
  emojiClass?: string;
}) {
  const [failed, setFailed] = useState(false);
  const url = connectorIconUrl(slug);

  if (url && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt=""
        loading="lazy"
        className={`${imgClass} object-contain`}
        onError={() => setFailed(true)}
      />
    );
  }
  return <span className={emojiClass}>{emoji ?? '🔌'}</span>;
}
