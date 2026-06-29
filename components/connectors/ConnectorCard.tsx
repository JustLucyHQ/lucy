'use client';

import React from 'react';
import { Badge } from '@/components/ui/Badge';
import { ConnectorIcon } from './ConnectorIcon';
import type { CatalogServer, Installation } from '@/lib/mcp/types';

interface ConnectorCardProps {
  server: CatalogServer;
  installation?: Installation;
  /** True when the user has completed the OAuth Connect flow for this connector. */
  connected?: boolean;
  onOpen: (server: CatalogServer) => void;
}

/** Returns the chip label and styling for the card action chip. */
function getChipState(server: CatalogServer, installation?: Installation, connected?: boolean): {
  label: string;
  variant: 'success' | 'warning' | 'default' | 'info' | 'purple';
  locked?: boolean;
} {
  if (server.built_in) {
    return { label: 'Active', variant: 'success' };
  }
  // OAuth Connect is a complete setup on its own — no separate Install step.
  if (connected) {
    return { label: 'Connected ✓', variant: 'success' };
  }
  if (!installation) {
    return { label: 'Install', variant: 'info' };
  }
  // Installed — check if any required secret field is missing/unset
  const missingRequired = server.config_schema.some(
    (f) =>
      f.required &&
      f.type === 'secret' &&
      (!installation.config[f.key] || installation.config[f.key] === '')
  );
  if (missingRequired) {
    return { label: 'Configure', variant: 'warning' };
  }
  return { label: 'Installed ✓', variant: 'success' };
}

const CATEGORY_LABELS: Record<string, string> = {
  dev: 'Dev',
  productivity: 'Productivity',
  messaging: 'Messaging',
  data: 'Data',
  payments: 'Payments',
  search: 'Search',
  local: 'Local',
  builtin: 'Built-in',
};

export function ConnectorCard({ server, installation, connected, onOpen }: ConnectorCardProps) {
  const chip = getChipState(server, installation, connected);

  return (
    <div
      onClick={() => onOpen(server)}
      className="bg-gray-900 border border-gray-800 rounded-xl p-4 cursor-pointer hover:border-gray-600 hover:bg-gray-800/60 transition-all group flex flex-col gap-3"
    >
      {/* Header row: icon + name + verified */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-gray-800 border border-gray-700 flex items-center justify-center text-xl shrink-0 group-hover:border-gray-600 transition-colors">
            <ConnectorIcon slug={server.slug} emoji={server.icon} imgClass="w-6 h-6" emojiClass="text-xl" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-semibold text-white truncate">{server.name}</span>
              {server.verified && (
                <span title="Verified" className="text-lucy-400 text-xs shrink-0">✓</span>
              )}
            </div>
            <span className="text-xs text-gray-500">
              {CATEGORY_LABELS[server.category] ?? server.category}
            </span>
          </div>
        </div>
        <Badge variant={chip.variant} className="shrink-0 whitespace-nowrap">
          {chip.label}
        </Badge>
      </div>

      {/* Description */}
      <p className="text-xs text-gray-400 line-clamp-2 leading-relaxed">
        {server.description}
      </p>

      {/* Footer: tools count */}
      <div className="flex items-center gap-2 pt-1 border-t border-gray-800">
        <span className="text-xs text-gray-600">
          {server.tools.length} {server.tools.length === 1 ? 'tool' : 'tools'}
        </span>
        {server.transport === 'stdio' && server.install_ref && (
          <span className="text-xs text-gray-700 truncate font-mono">npx</span>
        )}
        {server.transport === 'http' || server.transport === 'sse' ? (
          <span className="text-xs text-gray-700">remote</span>
        ) : null}
      </div>
    </div>
  );
}
