import type { Metadata } from 'next';
import Link from 'next/link';
import { ShieldCheck, WifiOff, Plug, RefreshCw, Globe, Boxes, Terminal, type LucideIcon } from 'lucide-react';
import { LucyMark } from '@/components/brand/LucyMark';
import { DownloadPanel } from '@/components/landing/DownloadPanel';
import { SiteShell } from '@/components/site/SiteShell';

export const metadata: Metadata = {
  title: 'Download Lucy — desktop app for every AI provider',
  description:
    'Download the Lucy desktop app for Windows, macOS, or Linux. Local-first, works offline, and connected to every AI provider. Free and open source.',
};

// Fallback shown if the GitHub "latest release" lookup fails; the DownloadPanel
// otherwise links directly to the newest release's installers.
const VERSION = '0.1.9';

const PERKS: { icon: LucideIcon; title: string; body: string }[] = [
  { icon: ShieldCheck, title: 'Local-first by default', body: 'Your chats, memory, and provider keys stay on your machine. No account needed to start.' },
  { icon: WifiOff, title: 'Works offline', body: 'Run local models with Ollama or LM Studio — no internet, no API keys required.' },
  { icon: Plug, title: 'Every provider', body: 'Bring your own key for OpenAI, Claude, Gemini, Mistral, Groq, DeepSeek and more.' },
  { icon: RefreshCw, title: 'Sync when you want', body: 'Optionally connect a justlucy.ai account to back up and sync across your devices.' },
];

const OTHER: { icon: LucideIcon; title: string; body: string; href: string; cta: string }[] = [
  { icon: Globe, title: 'Use it in your browser', body: 'No install — open the web app and start chatting.', href: '/chat', cta: 'Open app' },
  { icon: Boxes, title: 'Self-host with Docker', body: 'Run the full stack on your own server, connected mode.', href: '/docs/self-hosting', cta: 'Read the guide' },
  { icon: Terminal, title: 'Command line', body: 'Talk to Lucy from your terminal with the CLI.', href: '/docs/quick-start', cta: 'Get started' },
];

export default function DownloadPage() {
  return (
    <SiteShell>
      <div className="max-w-5xl mx-auto px-6">
        {/* Hero */}
        <header className="text-center pt-12 pb-8">
          <LucyMark className="w-14 h-14 mx-auto rounded-2xl shadow-[0_0_30px_rgba(139,92,246,0.5)]" />
          <h1 className="mt-6 text-4xl sm:text-5xl font-extrabold tracking-[-0.03em] text-white">
            Download Lucy
          </h1>
          <p className="mt-4 text-lg text-gray-400 max-w-2xl mx-auto leading-relaxed">
            The desktop app runs the full Lucy server right on your machine — local-first, offline-capable,
            and connected to every AI provider. Free and open source.
          </p>
        </header>

        {/* Platform picker */}
        <DownloadPanel version={VERSION} />

        {/* What you get */}
        <section className="pt-20">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {PERKS.map((p) => (
              <div key={p.title} className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5">
                <div className="w-9 h-9 rounded-xl bg-lucy-500/12 border border-lucy-500/25 flex items-center justify-center mb-3">
                  <p.icon className="w-[18px] h-[18px] text-lucy-300" />
                </div>
                <p className="text-sm font-bold text-white">{p.title}</p>
                <p className="text-[13px] text-gray-400 leading-relaxed mt-1">{p.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Requirements + signing note */}
        <section className="pt-12">
          <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-6 text-sm text-gray-400 leading-relaxed">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-lucy-300 mb-3">System requirements</p>
            <ul className="space-y-1.5">
              <li>• <span className="text-gray-300">Windows</span> 10 or 11 (64-bit) — NSIS installer.</li>
              <li>• <span className="text-gray-300">macOS</span> 12 Monterey or later (Apple Silicon &amp; Intel).</li>
              <li>• <span className="text-gray-300">Linux</span> — AppImage, runs on most distributions.</li>
            </ul>
            <p className="mt-4 text-[13px] text-gray-500">
              macOS and Linux builds aren&apos;t notarized yet — allow the app in Gatekeeper, or mark the
              AppImage executable, to run it. First launch opens a quick setup so you can pick a cloud key or a
              local model.
            </p>
          </div>
        </section>

        {/* Other ways to run */}
        <section className="pt-12 pb-16">
          <h2 className="text-center text-xl font-extrabold text-white tracking-tight">Prefer not to install?</h2>
          <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
            {OTHER.map((o) => (
              <div key={o.title} className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5 flex flex-col">
                <o.icon className="w-6 h-6 text-lucy-300" />
                <p className="mt-3 text-sm font-bold text-white">{o.title}</p>
                <p className="text-[13px] text-gray-400 leading-relaxed mt-1 flex-1">{o.body}</p>
                <Link href={o.href} className="mt-3 text-sm font-semibold text-lucy-300 hover:text-lucy-200 transition-colors">
                  {o.cta} →
                </Link>
              </div>
            ))}
          </div>
        </section>
      </div>
    </SiteShell>
  );
}
