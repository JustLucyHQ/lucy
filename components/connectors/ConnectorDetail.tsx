'use client';

import React, { useState, useEffect } from 'react';
import { X, ShieldCheck, Wrench, Key, BookOpen, ExternalLink, Plug, Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import type { CatalogServer, Installation, ConfigField } from '@/lib/mcp/types';
import { ConnectorIcon } from './ConnectorIcon';

interface ConnectorDetailProps {
  server: CatalogServer;
  installation?: Installation;
  onClose: () => void;
  onInstall: (config: Record<string, string>) => Promise<void>;
  onUninstall: () => Promise<void>;
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
  cloud: 'Cloud',
  crm: 'CRM',
};

function SecretInput({
  field,
  alreadySet,
  value,
  onChange,
}: {
  field: ConfigField;
  alreadySet: boolean;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <Input
      type="password"
      label={field.label + (field.required ? ' *' : '')}
      placeholder={alreadySet ? '••• set — leave blank to keep' : field.help ?? `Enter ${field.label}`}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      hint={field.help}
    />
  );
}

export function ConnectorDetail({
  server,
  installation,
  onClose,
  onInstall,
  onUninstall,
}: ConnectorDetailProps) {
  // Build initial form state: blank strings (user must re-enter secrets; text fields pre-filled)
  const initialForm = (): Record<string, string> => {
    const obj: Record<string, string> = {};
    for (const f of server.config_schema) {
      if (f.type === 'text' && installation?.config[f.key]) {
        obj[f.key] = String(installation.config[f.key]);
      } else {
        obj[f.key] = '';
      }
    }
    return obj;
  };

  // Form resets when the server changes via the `key={server.slug}` prop at
  // the call site (app/connectors/page.tsx) — React remounts this component,
  // re-running the useState initializer. No reset effect needed.
  const [form, setForm] = useState<Record<string, string>>(initialForm);
  const [saving, setSaving] = useState(false);
  const [uninstalling, setUninstalling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // OAuth Connect state (only for connectors that declare meta.oauth).
  const isOAuth = Boolean(server.meta?.oauth);
  const [oauthStatus, setOauthStatus] = useState<'loading' | 'connect' | 'connected' | 'soon'>(
    isOAuth ? 'loading' : 'soon'
  );

  useEffect(() => {
    if (!isOAuth) return;
    let cancelled = false;
    fetch('/api/oauth/connections')
      .then((r) => r.json())
      .then((d: { connections?: string[]; configured?: string[] }) => {
        if (cancelled) return;
        if (d.connections?.includes(server.slug)) setOauthStatus('connected');
        else if (d.configured?.includes(server.slug)) setOauthStatus('connect');
        else setOauthStatus('soon');
      })
      .catch(() => { if (!cancelled) setOauthStatus('soon'); });
    return () => { cancelled = true; };
  }, [isOAuth, server.slug]);

  const handleDisconnect = async () => {
    setOauthStatus('loading');
    try {
      await fetch(`/api/oauth/connections?provider=${encodeURIComponent(server.slug)}`, { method: 'DELETE' });
    } catch { /* ignore — fall back to connect state */ }
    setOauthStatus('connect');
  };

  const isInstalled = Boolean(installation);
  const isAlreadySet = (key: string) =>
    Boolean(installation?.config[key] && installation.config[key] !== '');

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await onInstall(form);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleUninstall = async () => {
    if (!confirm(`Uninstall ${server.name}? This will remove your saved config.`)) return;
    setUninstalling(true);
    setError(null);
    try {
      await onUninstall();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to uninstall');
    } finally {
      setUninstalling(false);
    }
  };

  const transportLabel =
    server.transport === 'stdio'
      ? `Local · npx ${server.install_ref ?? ''}`
      : 'Remote';

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="relative bg-gray-900 border border-gray-700 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[90vh] flex flex-col shadow-2xl z-10">
        {/* Header */}
        <div className="flex items-start gap-3 p-5 border-b border-gray-800">
          <div className="w-11 h-11 rounded-xl bg-gray-800 border border-gray-700 flex items-center justify-center text-2xl shrink-0">
            <ConnectorIcon slug={server.slug} emoji={server.icon} imgClass="w-7 h-7" emojiClass="text-2xl" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-bold text-white">{server.name}</h2>
              {server.verified && (
                <Badge variant="success" className="flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" />
                  Verified
                </Badge>
              )}
              {server.built_in && (
                <Badge variant="purple">Built-in</Badge>
              )}
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs text-gray-500">
                {CATEGORY_LABELS[server.category] ?? server.category}
              </span>
              <span className="text-gray-700 text-xs">·</span>
              <span className="text-xs text-gray-600 font-mono truncate">{transportLabel}</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-500 hover:text-gray-300 transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 p-5 space-y-5">
          {/* Description */}
          <p className="text-sm text-gray-400">{server.description}</p>

          {/* Tools list */}
          {server.tools.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                <Wrench className="w-3.5 h-3.5" />
                Tools ({server.tools.length})
              </div>
              <ul className="space-y-1">
                {server.tools.map((t) => (
                  <li key={t.name} className="flex items-start gap-2 text-xs">
                    <span className="font-mono text-lucy-400 bg-lucy-900/20 px-1.5 py-0.5 rounded border border-lucy-800/30 shrink-0">
                      {t.name}
                    </span>
                    <span className="text-gray-500 pt-0.5">{t.description}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* OAuth Connect — one-click where the provider's app is configured */}
          {isOAuth && (
            <div className="space-y-2">
              {oauthStatus === 'loading' && (
                <div className="flex items-center gap-2 text-xs text-gray-500 px-1 py-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Checking connection…
                </div>
              )}
              {oauthStatus === 'connect' && (
                <a
                  href={`/api/oauth/${server.slug}/start`}
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-lucy-600 hover:bg-lucy-500 text-white text-sm font-medium transition-colors"
                >
                  <Plug className="w-4 h-4" />
                  Connect with {server.name}
                </a>
              )}
              {oauthStatus === 'connected' && (
                <div className="flex items-center justify-between gap-3 bg-green-900/20 border border-green-800/40 rounded-lg px-3 py-2.5">
                  <span className="flex items-center gap-1.5 text-sm text-green-300 font-medium">
                    <Check className="w-4 h-4" /> Connected
                  </span>
                  <button
                    onClick={handleDisconnect}
                    className="text-xs text-gray-400 hover:text-red-300 transition-colors"
                  >
                    Disconnect
                  </button>
                </div>
              )}
              {oauthStatus === 'soon' && (
                <p className="text-xs text-lucy-300 bg-lucy-900/20 border border-lucy-800/40 rounded-lg px-3 py-2 flex items-center gap-1.5">
                  <span>🔗</span>
                  <span>One-click <strong className="font-semibold">Connect</strong> is coming for this connector — the steps below show how it’ll work.</span>
                </p>
              )}
              {server.config_schema.length > 0 && oauthStatus !== 'connected' && (
                <p className="text-[11px] text-gray-600 text-center pt-0.5">or paste a token below</p>
              )}
            </div>
          )}

          {/* Config form — hidden once OAuth-connected (Connect is the whole step). */}
          {!server.built_in && server.config_schema.length > 0 && oauthStatus !== 'connected' && (
            <div className="space-y-3">
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Configuration
              </div>
              {server.config_schema.map((field) =>
                field.type === 'secret' ? (
                  <SecretInput
                    key={field.key}
                    field={field}
                    alreadySet={isAlreadySet(field.key)}
                    value={form[field.key] ?? ''}
                    onChange={(v) => setForm((prev) => ({ ...prev, [field.key]: v }))}
                  />
                ) : (
                  <Input
                    key={field.key}
                    label={field.label + (field.required ? ' *' : '')}
                    placeholder={field.help ?? `Enter ${field.label}`}
                    value={form[field.key] ?? ''}
                    onChange={(e) => setForm((prev) => ({ ...prev, [field.key]: e.target.value }))}
                    hint={field.help}
                  />
                )
              )}
              {/* Encrypted storage note */}
              <p className="text-xs text-gray-600 flex items-center gap-1.5 pt-1">
                <span>🔒</span>
                Stored encrypted, per-user
              </p>
            </div>
          )}

          {/* Built-in note */}
          {server.built_in && (
            <p className="text-xs text-gray-600 bg-gray-800/50 border border-gray-700 rounded-lg px-3 py-2">
              This connector is built-in and always active. No configuration needed.
            </p>
          )}

          {/* Setup help — "how to get your key" / "how to connect" + doc links */}
          {server.meta && (server.meta.steps?.length || server.meta.getKeyUrl || server.meta.docsUrl) && (
            <div className="space-y-2.5 bg-gray-800/40 border border-gray-800 rounded-lg p-4">
              <div className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
                {server.meta.authMethod === 'oauth_app' || server.meta.authMethod === 'oauth_remote_mcp'
                  ? 'How to connect'
                  : 'How to get your key'}
              </div>
              {server.meta.steps && server.meta.steps.length > 0 && (
                <ol className="space-y-2">
                  {server.meta.steps.map((step, i) => (
                    <li key={i} className="flex gap-2.5 text-xs text-gray-400">
                      <span className="shrink-0 w-4 h-4 rounded-full bg-gray-700 text-[10px] text-gray-300 flex items-center justify-center mt-0.5 font-medium">
                        {i + 1}
                      </span>
                      <span className="leading-relaxed">{step}</span>
                    </li>
                  ))}
                </ol>
              )}
              {(server.meta.getKeyUrl || server.meta.docsUrl) && (
                <div className="flex flex-wrap gap-2 pt-0.5">
                  {server.meta.getKeyUrl && (
                    <a
                      href={server.meta.getKeyUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-white bg-lucy-600 hover:bg-lucy-500 px-3 py-1.5 rounded-lg transition-colors"
                    >
                      <Key className="w-3.5 h-3.5" />
                      {server.meta.authMethod === 'api_key' || server.meta.authMethod === 'connection_string'
                        ? 'Create your key'
                        : 'Set up'}
                      <ExternalLink className="w-3 h-3 opacity-70" />
                    </a>
                  )}
                  {server.meta.docsUrl && (
                    <a
                      href={server.meta.docsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-300 bg-gray-800 hover:bg-gray-700 border border-gray-700 px-3 py-1.5 rounded-lg transition-colors"
                    >
                      <BookOpen className="w-3.5 h-3.5" />
                      Docs
                      <ExternalLink className="w-3 h-3 opacity-70" />
                    </a>
                  )}
                </div>
              )}
            </div>
          )}

          {error && (
            <p className="text-xs text-red-400 bg-red-900/20 border border-red-800 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
        </div>

        {/* Footer actions */}
        {!server.built_in && (server.config_schema.length > 0 || isInstalled) && oauthStatus !== 'connected' && (
          <div className="flex items-center justify-between gap-3 p-5 border-t border-gray-800">
            {isInstalled ? (
              <Button
                variant="danger"
                size="sm"
                onClick={handleUninstall}
                loading={uninstalling}
                disabled={saving}
              >
                Uninstall
              </Button>
            ) : (
              <div /> /* spacer */
            )}
            <Button
              variant="primary"
              size="sm"
              onClick={handleSave}
              loading={saving}
              disabled={uninstalling}
            >
              {isInstalled ? 'Save' : 'Install'}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
