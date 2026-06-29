'use client';

import React, { useState } from 'react';
import { Plus, X, Loader2 } from 'lucide-react';

/**
 * "Add custom connector" — lets a user add a remote MCP server by URL when it
 * isn't in the catalog. POSTs to /api/mcp/custom; on success calls onAdded().
 */
export function AddCustomConnector({ onAdded }: { onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [token, setToken] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => { setName(''); setUrl(''); setToken(''); setError(null); };

  const submit = async () => {
    if (!name.trim() || !/^https?:\/\/.+/i.test(url.trim())) {
      setError('A name and a valid https:// URL are required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/mcp/custom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), url: url.trim(), token: token.trim() || undefined }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Failed to add connector');
      setOpen(false);
      reset();
      onAdded();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add connector');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-700 bg-gray-900 text-sm text-gray-300 hover:border-lucy-500 hover:text-white transition-colors shrink-0"
      >
        <Plus className="w-3.5 h-3.5" />
        Add custom
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="relative bg-gray-900 border border-gray-700 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md shadow-2xl z-10">
            <div className="flex items-center justify-between p-5 border-b border-gray-800">
              <h2 className="text-base font-bold text-white">Add a custom connector</h2>
              <button onClick={() => setOpen(false)} className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-500 hover:text-gray-300">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <p className="text-xs text-gray-500">
                Point Lucy at any <strong className="text-gray-300">remote MCP server</strong> by URL. If the
                server needs OAuth, use its Connect button after adding; if it needs a static token, paste it below.
              </p>

              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-400">Name *</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="My MCP server"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-600 outline-none focus:border-lucy-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-400">Remote MCP URL *</label>
                <input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://my-mcp.example.com/mcp"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-600 outline-none focus:border-lucy-500 font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-400">
                  API token <span className="text-gray-600">(optional)</span>
                </label>
                <input
                  type="password"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="Bearer token, if the server needs one"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-600 outline-none focus:border-lucy-500"
                />
                <p className="text-[11px] text-gray-600">Stored encrypted. Leave blank for open servers or OAuth.</p>
              </div>

              {error && (
                <p className="text-xs text-red-400 bg-red-900/20 border border-red-800 rounded-lg px-3 py-2">{error}</p>
              )}
            </div>

            <div className="flex justify-end gap-2 p-5 border-t border-gray-800">
              <button onClick={() => setOpen(false)} className="px-4 py-2 rounded-lg text-sm text-gray-400 hover:text-gray-200">
                Cancel
              </button>
              <button
                onClick={submit}
                disabled={saving}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-lucy-600 hover:bg-lucy-500 text-white text-sm font-medium disabled:opacity-50"
              >
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Add connector
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
