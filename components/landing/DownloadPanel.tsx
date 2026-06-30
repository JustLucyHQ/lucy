'use client';
import { useSyncExternalStore } from 'react';
import { Download } from 'lucide-react';
import { GITHUB_URL } from './features';
import { OsIcon } from './OsIcon';

type OS = 'windows' | 'mac' | 'linux';

const RELEASES = `${GITHUB_URL}/releases`;

interface Platform {
  id: OS;
  name: string;
  file: string;
  note: string;
  href: string;
}

// Direct per-OS installer URLs for the given version, e.g.
//   https://github.com/JustLucyHQ/lucy/releases/download/v0.1.9/Lucy.Setup.0.1.9.exe
// (asset names match what electron-builder + GitHub produce — spaces become dots).
function platforms(version: string): Platform[] {
  const base = `${GITHUB_URL}/releases/download/v${version}`;
  return [
    { id: 'windows', name: 'Windows', note: 'Windows 10 / 11 · 64-bit', file: `Lucy.Setup.${version}.exe`, href: `${base}/Lucy.Setup.${version}.exe` },
    { id: 'mac', name: 'macOS', note: 'macOS 12+ · Apple Silicon', file: `Lucy-${version}-arm64.dmg`, href: `${base}/Lucy-${version}-arm64.dmg` },
    { id: 'linux', name: 'Linux', note: 'AppImage · most distros', file: `Lucy-${version}.AppImage`, href: `${base}/Lucy-${version}.AppImage` },
  ];
}

function detectOS(): OS {
  if (typeof navigator === 'undefined') return 'windows';
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes('mac')) return 'mac';
  if (ua.includes('linux') || ua.includes('android')) return 'linux';
  return 'windows';
}

const subscribeOS = () => () => {};

export function DownloadPanel({ version }: { version: string }) {
  // Detect OS client-side (server renders the default); hydration-safe + lint-clean.
  const os = useSyncExternalStore<OS | null>(subscribeOS, () => detectOS(), () => null);

  const all = platforms(version);
  const primary = all.find((p) => p.id === os) ?? all[0];
  const others = all.filter((p) => p.id !== primary.id);

  return (
    <section className="mt-2">
      {/* Recommended download for the visitor's OS */}
      <div className="max-w-md mx-auto rounded-2xl border border-lucy-500/25 bg-lucy-500/[0.06] p-6 text-center shadow-[0_0_50px_rgba(139,92,246,0.18)]">
        <OsIcon os={primary.id} className="w-8 h-8 mx-auto text-lucy-300" />
        <p className="mt-3 text-[11px] font-bold uppercase tracking-[0.18em] text-lucy-300">
          {os ? 'Recommended for you' : 'Desktop app'}
        </p>
        <a
          href={primary.href}
          className="mt-3 inline-flex items-center gap-2 text-sm font-bold text-white bg-gradient-to-br from-lucy-500 to-lucy-700 hover:from-lucy-400 hover:to-lucy-600 rounded-full px-6 py-3 shadow-[0_0_28px_rgba(139,92,246,0.45)] transition-all"
        >
          <Download className="w-4 h-4" /> Download for {primary.name}
        </a>
        <p className="mt-3 text-xs text-gray-500">
          Version {version} · {primary.file}
        </p>
      </div>

      {/* Other platforms */}
      <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl mx-auto">
        {others.map((p) => (
          <a
            key={p.id}
            href={p.href}
            className="group flex items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.025] p-4 transition-all hover:border-lucy-500/35 hover:bg-lucy-500/[0.05]"
          >
            <OsIcon os={p.id} className="w-6 h-6 text-gray-400 group-hover:text-lucy-300 transition-colors" />
            <span className="flex-1">
              <span className="block text-sm font-semibold text-white">{p.name}</span>
              <span className="block text-[11px] text-gray-500">{p.note}</span>
            </span>
            <Download className="w-4 h-4 text-gray-500 group-hover:text-lucy-300 transition-colors" />
          </a>
        ))}
      </div>

      <p className="mt-5 text-center text-xs text-gray-500">
        Free &amp; open source ·{' '}
        <a href={RELEASES} target="_blank" rel="noreferrer" className="text-lucy-300 hover:text-lucy-200 transition-colors">
          All versions &amp; release notes →
        </a>
      </p>
    </section>
  );
}
