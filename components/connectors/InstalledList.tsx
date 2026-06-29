'use client';

import React from 'react';
import { Settings, Trash2, Plug } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { ConnectorIcon } from './ConnectorIcon';
import type { CatalogServer, Installation } from '@/lib/mcp/types';

interface InstalledListProps {
  installations: Installation[];
  servers: CatalogServer[];
  /** Slugs the user has OAuth-connected (no mcp_installation row needed). */
  connectedSlugs?: string[];
  onToggle: (slug: string, enabled: boolean) => Promise<void>;
  onApprovalToggle: (slug: string, requireApproval: boolean) => Promise<void>;
  onConfigure: (server: CatalogServer) => void;
  onUninstall: (slug: string) => Promise<void>;
  onDisconnect?: (slug: string) => Promise<void>;
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative w-9 h-5 rounded-full transition-colors shrink-0 focus:outline-none focus:ring-2 focus:ring-lucy-500 focus:ring-offset-2 focus:ring-offset-gray-900 ${
        checked ? 'bg-lucy-600' : 'bg-gray-700'
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
          checked ? 'translate-x-4' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

export function InstalledList({
  installations,
  servers,
  connectedSlugs = [],
  onToggle,
  onApprovalToggle,
  onConfigure,
  onUninstall,
  onDisconnect,
}: InstalledListProps) {
  // OAuth-connected connectors that have no separate mcp_installation row.
  const connectedServers = connectedSlugs
    .filter((slug) => !installations.some((i) => i.server_slug === slug))
    .map((slug) => servers.find((s) => s.slug === slug))
    .filter((s): s is CatalogServer => Boolean(s));

  if (installations.length === 0 && connectedServers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="text-4xl mb-3">🔌</div>
        <p className="text-gray-400 text-sm font-medium">No connectors installed yet</p>
        <p className="text-gray-600 text-xs mt-1">
          Switch to Browse to find and install connectors.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* OAuth-connected connectors (GitHub, Google, Slack, …) */}
      {connectedServers.map((server) => (
        <div
          key={`oauth-${server.slug}`}
          className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-4"
        >
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-gray-800 border border-gray-700 flex items-center justify-center text-xl shrink-0">
              <ConnectorIcon slug={server.slug} emoji={server.icon} imgClass="w-6 h-6" emojiClass="text-xl" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-semibold text-white truncate">{server.name}</span>
                <Badge variant="success" className="text-xs">Connected</Badge>
              </div>
              <p className="text-xs text-gray-500 truncate">{server.description}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="ghost" size="sm" icon={<Settings className="w-3.5 h-3.5" />} onClick={() => onConfigure(server)}>
              Manage
            </Button>
            {onDisconnect && (
              <Button
                variant="ghost"
                size="sm"
                icon={<Plug className="w-3.5 h-3.5 text-red-400" />}
                onClick={() => onDisconnect(server.slug)}
                className="text-red-400 hover:text-red-300 hover:bg-red-900/20"
              >
                Disconnect
              </Button>
            )}
          </div>
        </div>
      ))}

      {installations.map((inst) => {
        const server = servers.find((s) => s.slug === inst.server_slug);
        if (!server) return null;

        return (
          <div
            key={inst.server_slug}
            className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-4"
          >
            {/* Left: icon + name + category */}
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="w-9 h-9 rounded-lg bg-gray-800 border border-gray-700 flex items-center justify-center text-xl shrink-0">
                <ConnectorIcon slug={server.slug} emoji={server.icon} imgClass="w-6 h-6" emojiClass="text-xl" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-semibold text-white truncate">{server.name}</span>
                  {server.verified && (
                    <span title="Verified" className="text-lucy-400 text-xs shrink-0">✓</span>
                  )}
                  {server.built_in && (
                    <Badge variant="purple" className="text-xs">built-in</Badge>
                  )}
                </div>
                <p className="text-xs text-gray-500 truncate">{server.description}</p>
              </div>
            </div>

            {/* Right: toggles + buttons */}
            <div className="flex items-center gap-4 flex-wrap sm:flex-nowrap shrink-0">
              {/* Enable/disable toggle */}
              <div className="flex items-center gap-2">
                <Toggle
                  checked={inst.enabled}
                  onChange={(v) => onToggle(inst.server_slug, v)}
                  label={inst.enabled ? 'Disable connector' : 'Enable connector'}
                />
                <span className="text-xs text-gray-500 whitespace-nowrap">
                  {inst.enabled ? 'Enabled' : 'Disabled'}
                </span>
              </div>

              {/* Require approval toggle (write-gating) */}
              {!server.built_in && (
                <div className="flex items-center gap-2">
                  <Toggle
                    checked={inst.require_approval}
                    onChange={(v) => onApprovalToggle(inst.server_slug, v)}
                    label={inst.require_approval ? 'Remove approval gate' : 'Require approval before writes'}
                  />
                  <span className="text-xs text-gray-500 whitespace-nowrap">Approve writes</span>
                </div>
              )}

              {/* Configure button (not for built-ins without config) */}
              {!server.built_in && (
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<Settings className="w-3.5 h-3.5" />}
                  onClick={() => onConfigure(server)}
                >
                  Configure
                </Button>
              )}

              {/* Uninstall button */}
              {!server.built_in && (
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<Trash2 className="w-3.5 h-3.5 text-red-400" />}
                  onClick={() => onUninstall(inst.server_slug)}
                  className="text-red-400 hover:text-red-300 hover:bg-red-900/20"
                >
                  Uninstall
                </Button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
