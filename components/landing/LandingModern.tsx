import Link from 'next/link';
import { ArrowRight, Sparkles, Download } from 'lucide-react';
import { GitHubIcon } from './GitHubIcon';
import { LucyMark } from '@/components/brand/LucyMark';
import { ProviderConstellation } from './ProviderConstellation';
import { ConnectorIcon } from './ConnectorIcon';
import { SiteHeader } from '@/components/site/SiteHeader';
import { SiteFooter } from '@/components/site/SiteFooter';
import {
  SUBLINE, GITHUB_URL, FEATURES,
  BANNER, BANNER_SUB, MANIFESTO_HEADING, MANIFESTO_SUB, PILLARS,
  PROVIDER_CARDS, CONNECTOR_TILES, MARKETPLACE_HEADING, MARKETPLACE_SUB,
  EMBED_SNIPPET, INTEGRATE_HEADING, INTEGRATE_POINTS,
} from './features';
import { Monogram } from './Monogram';

/**
 * Modern landing — Luminous tone: deep space background, glassy panels,
 * purple glow, bold Manrope. Clean lines, staggered hero reveal.
 */

function MiniChat() {
  return (
    <div className="rounded-2xl border border-lucy-500/20 ring-1 ring-lucy-500/10 bg-[#12101f]/90 shadow-[0_0_110px_rgba(139,92,246,0.32)] overflow-hidden text-left">
      <style>{`@keyframes lucyTyping { 0%, 60%, 100% { opacity: .35; transform: translateY(0) } 30% { opacity: 1; transform: translateY(-3px) } }`}</style>
      {/* Window header */}
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-[#312e4e] bg-[#16132a]/80">
        <LucyMark className="w-6 h-6 rounded-lg shadow-[0_0_10px_rgba(139,92,246,0.5)]" />
        <span className="text-sm font-bold text-white tracking-tight">Lucy</span>
        <span className="ml-auto text-[10px] font-semibold text-lucy-300 bg-lucy-500/15 border border-lucy-500/25 rounded-full px-2.5 py-0.5">
          claude-sonnet
        </span>
      </div>
      {/* Messages */}
      <div className="p-5 space-y-4 text-[13px] leading-relaxed">
        <div className="flex justify-end">
          <div className="max-w-[75%] rounded-2xl rounded-br-md bg-gradient-to-br from-lucy-500 to-lucy-700 text-white px-4 py-2.5 font-medium shadow-[0_4px_20px_rgba(139,92,246,0.35)]">
            Compare our Q2 numbers against the forecast — and switch to a local model for the raw data.
          </div>
        </div>
        <div className="flex gap-2.5">
          <LucyMark className="w-6 h-6 shrink-0 mt-0.5" />
          <div className="max-w-[80%] rounded-2xl rounded-bl-md bg-white/[0.04] border border-white/[0.07] text-gray-200 px-4 py-2.5">
            Done — switching to <span className="text-lucy-300 font-semibold">Ollama · llama3</span> for the
            sensitive rows. Q2 revenue is <span className="text-white font-semibold">+12% over forecast</span>;
            two regions miss. Want the workflow to send this to Slack?
          </div>
        </div>
        {/* Tool chips */}
        <div className="flex gap-1.5 pl-9">
          <span className="text-[10px] font-semibold text-emerald-300 bg-emerald-500/10 border border-emerald-500/25 rounded-full px-2 py-0.5">✓ postgres · query</span>
          <span className="text-[10px] font-semibold text-gray-400 bg-white/[0.04] border border-white/[0.08] rounded-full px-2 py-0.5">🧠 3 memories used</span>
        </div>
        {/* Typing indicator */}
        <div className="flex gap-2.5">
          <LucyMark className="w-6 h-6 shrink-0 mt-0.5" />
          <div className="rounded-2xl rounded-bl-md bg-white/[0.04] border border-white/[0.07] px-4 py-3 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-lucy-300" style={{ animation: 'lucyTyping 1.2s ease-in-out 0ms infinite' }} />
            <span className="w-1.5 h-1.5 rounded-full bg-lucy-300" style={{ animation: 'lucyTyping 1.2s ease-in-out 160ms infinite' }} />
            <span className="w-1.5 h-1.5 rounded-full bg-lucy-300" style={{ animation: 'lucyTyping 1.2s ease-in-out 320ms infinite' }} />
          </div>
        </div>
        {/* Input */}
        <div className="flex items-center gap-2 pt-1">
          <div className="flex-1 rounded-full border border-lucy-500/30 bg-white/[0.03] px-4 py-2.5 text-gray-500">
            Message Lucy…
          </div>
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-lucy-500 to-lucy-700 shadow-[0_0_16px_rgba(139,92,246,0.5)] flex items-center justify-center">
            <ArrowRight className="w-4 h-4 text-white" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function LandingModern() {
  return (
    <div className="min-h-screen bg-[#0c0a16] text-gray-200 font-sans overflow-x-hidden">
      {/* Atmosphere */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0"
        style={{
          background:
            'radial-gradient(ellipse 60% 40% at 50% -10%, rgba(139,92,246,0.22), transparent 65%),' +
            'radial-gradient(ellipse 40% 30% at 85% 25%, rgba(109,40,217,0.12), transparent 70%),' +
            'radial-gradient(ellipse 50% 35% at 10% 60%, rgba(139,92,246,0.07), transparent 70%)',
        }}
      />

      <SiteHeader />

      <div className="relative max-w-6xl mx-auto px-6">
        {/* Hero */}
        <header className="text-center pt-14 pb-10">
          <div className="animate-fade-in inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-lucy-300 bg-lucy-500/10 border border-lucy-500/25 rounded-full px-4 py-1.5">
            <Sparkles className="w-3 h-3" /> Open source · Self-hosted · Free
          </div>
          <h1 className="animate-slide-up mt-6 text-5xl sm:text-6xl font-extrabold tracking-[-0.03em] text-white leading-[1.05]">
            Your AI, <span className="bg-gradient-to-r from-lucy-300 to-lucy-500 bg-clip-text text-transparent">every provider</span>,
            <br className="hidden sm:block" /> one memory.
          </h1>
          <p className="animate-slide-up [animation-delay:120ms] mt-6 text-lg text-gray-400 max-w-2xl mx-auto leading-relaxed">
            {SUBLINE}
          </p>
          <div className="animate-slide-up [animation-delay:240ms] mt-8 flex items-center justify-center gap-3">
            <Link
              href="/download"
              className="inline-flex items-center gap-2 text-sm font-bold text-white bg-gradient-to-br from-lucy-500 to-lucy-700 hover:from-lucy-400 hover:to-lucy-600 rounded-full px-6 py-3 shadow-[0_0_28px_rgba(139,92,246,0.45)] transition-all"
            >
              <Download className="w-4 h-4" /> Download
            </Link>
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 text-sm font-semibold text-gray-300 hover:text-white border border-white/[0.12] hover:border-white/[0.25] rounded-full px-6 py-3 transition-colors"
            >
              <GitHubIcon className="w-4 h-4" /> Star on GitHub
            </a>
          </div>
        </header>

        {/* App preview */}
        <section className="animate-slide-up [animation-delay:420ms] max-w-3xl mx-auto pb-20">
          <div className="relative">
            {/* ambient glow behind the chat */}
            <div className="pointer-events-none absolute -inset-x-10 -top-12 -bottom-6 bg-[radial-gradient(ellipse_at_center,rgba(139,92,246,0.20),transparent_70%)] blur-2xl" />
            <div className="relative">
              <MiniChat />
            </div>
          </div>
          <ProviderConstellation />
        </section>

        {/* Manifesto — the differentiator */}
        <section className="pb-20">
          <p className="text-center text-[11px] font-bold uppercase tracking-[0.22em] text-lucy-400 mb-3">
            Why Lucy
          </p>
          <h2 className="text-center text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
            {MANIFESTO_HEADING}
          </h2>
          <p className="text-center text-gray-400 max-w-2xl mx-auto mt-4 mb-12 leading-relaxed">
            {MANIFESTO_SUB}
          </p>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {PILLARS.map((p, i) => (
              <div
                key={p.kicker}
                className={`rounded-2xl border p-7 ${
                  i === 1
                    ? 'border-lucy-500/30 bg-lucy-500/[0.06] shadow-[0_0_40px_rgba(139,92,246,0.1)]'
                    : 'border-white/[0.07] bg-white/[0.025]'
                }`}
              >
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-lucy-300 mb-2">
                  {p.kicker}
                </p>
                <h3 className="text-lg font-extrabold tracking-tight text-white mb-2">{p.title}</h3>
                <p className="text-[13px] text-gray-400 leading-relaxed">{p.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Providers — section hidden for now (to be reworked) */}
        {false && (
        <section className="pb-20">
          <p className="text-center text-[11px] font-bold uppercase tracking-[0.22em] text-lucy-400 mb-3">
            Every provider
          </p>
          <h2 className="text-center text-3xl font-extrabold tracking-tight text-white">
            The models come to you
          </h2>
          <p className="text-center text-gray-400 max-w-2xl mx-auto mt-4 mb-12 leading-relaxed">
            Ten providers, twenty-five-plus models, one interface. Swap mid-conversation, mix cloud
            with local, and keep your conversation history either way.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {PROVIDER_CARDS.map((p) => (
              <div
                key={p.name}
                className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4 transition-all hover:border-lucy-500/35 hover:bg-lucy-500/[0.05]"
              >
                <div className="flex items-center justify-between mb-3">
                  <Monogram name={p.name} color={p.color} fg={p.fg} />
                  {p.kind === 'local' && (
                    <span className="text-[9px] font-bold uppercase tracking-wide text-emerald-300 bg-emerald-500/10 border border-emerald-500/25 rounded-full px-2 py-0.5">
                      Local
                    </span>
                  )}
                </div>
                <p className="text-sm font-bold text-white tracking-tight">{p.name}</p>
                <p className="text-[11px] text-gray-500 leading-snug mt-0.5">{p.models}</p>
              </div>
            ))}
          </div>
        </section>
        )}

        {/* Marketplace */}
        <section className="pb-20">
          <p className="text-center text-[11px] font-bold uppercase tracking-[0.22em] text-lucy-400 mb-3">
            Connector marketplace
          </p>
          <h2 className="text-center text-3xl font-extrabold tracking-tight text-white">
            {MARKETPLACE_HEADING}
          </h2>
          <p className="text-center text-gray-400 max-w-2xl mx-auto mt-4 mb-12 leading-relaxed">
            {MARKETPLACE_SUB}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {CONNECTOR_TILES.map((c) => (
              <div
                key={c.name}
                className="group flex items-center gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-3.5 transition-all hover:border-lucy-500/35 hover:bg-lucy-500/[0.05]"
              >
                <div className="w-8 h-8 rounded-lg bg-[#14121f] border border-white/[0.08] flex items-center justify-center shrink-0">
                  <ConnectorIcon name={c.name} className="w-[18px] h-[18px]" />
                </div>
                <div className="min-w-0">
                  <p className="text-[13px] font-bold text-white tracking-tight truncate">{c.name}</p>
                  <p className="text-[10px] text-gray-500 group-hover:text-lucy-300 transition-colors">
                    One-click install
                  </p>
                </div>
              </div>
            ))}
          </div>
          <p className="text-center text-xs text-gray-500 mt-6">
            Secrets encrypted at rest · write actions can require approval · runs on the open MCP standard
          </p>
        </section>

        {/* Features */}
        <section className="pb-20">
          <p className="text-center text-[11px] font-bold uppercase tracking-[0.22em] text-lucy-400 mb-3">
            Powerful features
          </p>
          <h2 className="text-center text-3xl font-extrabold tracking-tight text-white mb-12">
            Everything between you and every model
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="group rounded-2xl border border-white/[0.07] bg-white/[0.025] p-6 transition-all hover:border-lucy-500/35 hover:bg-lucy-500/[0.05] hover:shadow-[0_0_30px_rgba(139,92,246,0.12)]"
              >
                <div className="w-9 h-9 rounded-xl bg-lucy-500/12 border border-lucy-500/25 flex items-center justify-center mb-4 transition-colors group-hover:bg-lucy-500/20">
                  <f.icon className="w-[18px] h-[18px] text-lucy-300" />
                </div>
                <h3 className="text-[15px] font-bold text-white tracking-tight mb-1.5">{f.title}</h3>
                <p className="text-[13px] text-gray-400 leading-relaxed">{f.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Integrate */}
        <section className="pb-20">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-lucy-400 mb-3">
                Integration
              </p>
              <h2 className="text-3xl font-extrabold tracking-tight text-white mb-6">
                {INTEGRATE_HEADING}
              </h2>
              <dl className="space-y-5">
                {INTEGRATE_POINTS.map(([title, body]) => (
                  <div key={title} className="flex gap-3">
                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-lucy-400 shadow-[0_0_8px_rgba(139,92,246,0.8)] shrink-0" />
                    <div>
                      <dt className="text-sm font-bold text-white tracking-tight">{title}</dt>
                      <dd className="text-[13px] text-gray-400 leading-relaxed mt-0.5">{body}</dd>
                    </div>
                  </div>
                ))}
              </dl>
            </div>
            <div className="rounded-2xl border border-[#312e4e] bg-[#0e0c1b] overflow-hidden shadow-[0_0_60px_rgba(139,92,246,0.12)]">
              <div className="flex items-center gap-1.5 px-4 py-3 border-b border-[#312e4e]">
                <span className="w-2.5 h-2.5 rounded-full bg-red-400/60" />
                <span className="w-2.5 h-2.5 rounded-full bg-yellow-400/60" />
                <span className="w-2.5 h-2.5 rounded-full bg-green-400/60" />
                <span className="ml-2 text-[11px] text-gray-500 font-mono">anywhere-in-your-app.html</span>
              </div>
              <pre className="p-5 text-[12px] leading-relaxed font-mono text-lucy-200 whitespace-pre-wrap break-all">
                {EMBED_SNIPPET}
              </pre>
              <p className="px-5 pb-5 text-xs text-gray-500">
                That&rsquo;s the whole integration. Lucy appears as a widget inside your product,
                already aware of your business data.
              </p>
            </div>
          </div>
        </section>

        {/* Terminal */}
        <section className="pb-20">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
            <div className="rounded-2xl border border-lucy-500/20 ring-1 ring-lucy-500/10 bg-[#0b0a14] overflow-hidden shadow-[0_0_80px_rgba(139,92,246,0.20)] font-mono text-[12.5px] leading-relaxed">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.06] bg-gradient-to-b from-white/[0.04] to-transparent">
                <span className="w-3 h-3 rounded-full bg-[#ff5f57]" />
                <span className="w-3 h-3 rounded-full bg-[#febc2e]" />
                <span className="w-3 h-3 rounded-full bg-[#28c840]" />
                <span className="ml-1.5 text-[11px] text-gray-500">lucy — zsh</span>
              </div>
              <div className="p-5 space-y-1.5">
                <p><span className="text-gray-600 select-none">$</span> <span className="text-gray-100">lucy chat</span></p>
                <p><span className="text-lucy-300 font-bold">you ›</span> <span className="text-gray-300">what did we decide about the Q3 launch?</span></p>
                <p><span className="text-lucy-400 font-bold">lucy ›</span> <span className="text-gray-400">You moved it to October 14 and cut the beta waitlist — decided last Tuesday with Sara.</span></p>
                <p className="pt-2"><span className="text-gray-600 select-none">$</span> <span className="text-gray-100">cat error.log | lucy chat <span className="text-emerald-300">&quot;explain this&quot;</span></span></p>
                <p><span className="text-gray-600 select-none">$</span> <span className="text-gray-100">lucy memories remember <span className="text-emerald-300">&quot;staging DB is on port 6543&quot;</span></span></p>
                <p><span className="text-emerald-400">✓ saved</span></p>
                <p className="pt-1"><span className="text-gray-600 select-none">$</span> <span className="inline-block w-2 h-[15px] translate-y-[2px] bg-lucy-300 animate-pulse" /></p>
              </div>
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-lucy-400 mb-3">
                Two surfaces, one brain
              </p>
              <h2 className="text-3xl font-extrabold tracking-tight text-white mb-4">
                Also in your terminal
              </h2>
              <p className="text-gray-400 leading-relaxed mb-4">
                The Lucy CLI is a thin client over the same API — streaming chat, model switching,
                memory commands, and admin tools from any shell. Pipe logs into it, script it,
                keep it in a tmux pane.
              </p>
              <p className="text-[13px] text-gray-500 leading-relaxed">
                Same memory, same encrypted keys, same walls. One <span className="text-lucy-300 font-mono">lucy login</span> and
                your terminal knows everything your browser does.
              </p>
            </div>
          </div>
        </section>

        {/* Themes strip */}
        <section className="pb-20">
          <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-8 flex flex-col sm:flex-row items-center gap-6">
            <div className="flex-1">
              <h3 className="text-xl font-extrabold tracking-tight text-white">Make it yours</h3>
              <p className="text-sm text-gray-400 mt-1">
                Five built-in themes — Luminous, Industrial, Editorial, Minimal dark, and Light — switch the whole interface in one click.
              </p>
            </div>
            <div className="flex gap-2">
              {[
                ['#0c0a16', '#8b5cf6'], ['#0a0a0f', '#3f3f5a'], ['#050507', '#8b5cf6'],
                ['#030712', '#374151'], ['#fafafc', '#7c3aed'],
              ].map(([bg, accent], i) => (
                <div key={i} className="w-12 h-9 rounded-lg overflow-hidden border border-white/[0.1] flex">
                  <div style={{ background: bg }} className="flex-1" />
                  <div style={{ background: accent }} className="w-1.5" />
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Banner */}
        <section className="pb-20 text-center">
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-[-0.02em] text-white max-w-3xl mx-auto leading-snug">
            {BANNER}
          </h2>
          <p className="text-gray-400 max-w-2xl mx-auto mt-4 leading-relaxed">
            {BANNER_SUB}
          </p>
          <Link
            href="/chat"
            className="mt-8 inline-flex items-center gap-2 text-sm font-bold text-white bg-gradient-to-br from-lucy-500 to-lucy-700 hover:from-lucy-400 hover:to-lucy-600 rounded-full px-7 py-3 shadow-[0_0_28px_rgba(139,92,246,0.45)] transition-all"
          >
            Try Lucy now <ArrowRight className="w-4 h-4" />
          </Link>
        </section>

      </div>

      <SiteFooter />
    </div>
  );
}
