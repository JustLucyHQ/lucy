import Link from 'next/link';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import { GitHubIcon } from './GitHubIcon';
import { LucyMark } from '@/components/brand/LucyMark';
import {
  TAGLINE, SUBLINE, GITHUB_URL, PROVIDERS, FEATURES, FOOTER_BADGES,
  BANNER, BANNER_SUB, MANIFESTO_HEADING, MANIFESTO_SUB, PILLARS,
  PROVIDER_CARDS, CONNECTOR_TILES, MARKETPLACE_HEADING, MARKETPLACE_SUB,
  EMBED_SNIPPET, INTEGRATE_HEADING, INTEGRATE_POINTS,
} from './features';
import { Monogram } from './Monogram';

/**
 * Corporate landing — light, precise, enterprise-calm: white surfaces,
 * hairline slate borders, restrained purple accent, generous whitespace.
 */

function MiniChat() {
  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-[0_24px_60px_-24px_rgba(15,23,42,0.18)] overflow-hidden text-left">
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-slate-200 bg-slate-50">
        <LucyMark className="w-6 h-6 rounded-lg" />
        <span className="text-sm font-bold text-slate-900 tracking-tight">Lucy</span>
        <span className="ml-auto text-[10px] font-semibold text-violet-700 bg-violet-50 border border-violet-200 rounded-md px-2 py-0.5">
          claude-sonnet
        </span>
      </div>
      <div className="p-5 space-y-4 text-[13px] leading-relaxed bg-white">
        <div className="flex justify-end">
          <div className="max-w-[75%] rounded-lg bg-violet-600 text-white px-4 py-2.5 font-medium">
            Compare our Q2 numbers against the forecast — and switch to a local model for the raw data.
          </div>
        </div>
        <div className="flex gap-2.5">
          <LucyMark className="w-6 h-6 shrink-0 mt-0.5" />
          <div className="max-w-[80%] rounded-lg bg-slate-50 border border-slate-200 text-slate-700 px-4 py-2.5">
            Done — switching to <span className="text-violet-700 font-semibold">Ollama · llama3</span> for the
            sensitive rows. Q2 revenue is <span className="text-slate-900 font-semibold">+12% over forecast</span>;
            two regions miss. Want the workflow to send this to Slack?
          </div>
        </div>
        <div className="flex gap-1.5 pl-9">
          <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-2 py-0.5">✓ postgres · query</span>
          <span className="text-[10px] font-semibold text-slate-500 bg-slate-50 border border-slate-200 rounded-md px-2 py-0.5">3 memories used</span>
        </div>
        <div className="flex items-center gap-2 pt-1">
          <div className="flex-1 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-slate-400">
            Message Lucy…
          </div>
          <div className="w-9 h-9 rounded-lg bg-violet-600 flex items-center justify-center">
            <ArrowRight className="w-4 h-4 text-white" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function LandingCorporate() {
  return (
    <div className="min-h-screen bg-white text-slate-700 font-sans">
      {/* Nav */}
      <nav className="border-b border-slate-100">
        <div className="max-w-6xl mx-auto px-6 flex items-center justify-between py-5">
          <div className="flex items-center gap-2.5">
            <LucyMark className="w-8 h-8 rounded-lg" />
            <span className="hidden sm:inline text-lg font-extrabold tracking-tight">
              <span className="text-slate-400">Just</span> <span className="text-slate-900">Lucy</span>
            </span>
          </div>
          <div className="flex items-center gap-4">
            <Link
              href="/docs"
              className="text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors"
            >
              Docs
            </Link>
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors"
            >
              <GitHubIcon className="w-4 h-4" /> GitHub
            </a>
            <Link
              href="/chat"
              className="text-sm font-semibold text-white bg-slate-900 hover:bg-slate-700 rounded-lg px-4 py-2 transition-colors"
            >
              Open app
            </Link>
          </div>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-6">
        {/* Hero */}
        <header className="text-center pt-20 pb-12">
          <div className="animate-fade-in inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-violet-700 bg-violet-50 border border-violet-100 rounded-full px-4 py-1.5">
            Open source · Self-hosted · Free
          </div>
          <h1 className="animate-slide-up mt-6 text-5xl sm:text-6xl font-extrabold tracking-[-0.03em] text-slate-900 leading-[1.05]">
            {TAGLINE.replace(', one platform.', ',')}
            <br className="hidden sm:block" />
            <span className="text-violet-600"> one platform.</span>
          </h1>
          <p className="animate-slide-up [animation-delay:120ms] mt-6 text-lg text-slate-500 max-w-2xl mx-auto leading-relaxed">
            {SUBLINE}
          </p>
          <div className="animate-slide-up [animation-delay:240ms] mt-8 flex items-center justify-center gap-3">
            <Link
              href="/chat"
              className="inline-flex items-center gap-2 text-sm font-bold text-white bg-violet-600 hover:bg-violet-500 rounded-lg px-6 py-3 transition-colors"
            >
              Get started <ArrowRight className="w-4 h-4" />
            </Link>
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700 border border-slate-300 hover:border-slate-400 hover:bg-slate-50 rounded-lg px-6 py-3 transition-colors"
            >
              <GitHubIcon className="w-4 h-4" /> Star on GitHub
            </a>
          </div>
          <div className="animate-fade-in [animation-delay:360ms] mt-10 flex flex-wrap items-center justify-center gap-2">
            {PROVIDERS.map((p) => (
              <span
                key={p}
                className="text-xs font-semibold text-slate-500 bg-slate-50 border border-slate-200 rounded-md px-3.5 py-1.5"
              >
                {p}
              </span>
            ))}
          </div>
        </header>

        {/* App preview */}
        <section className="animate-slide-up [animation-delay:420ms] max-w-3xl mx-auto pb-20">
          <MiniChat />
        </section>

        {/* Manifesto — the differentiator */}
        <section className="pb-20">
          <p className="text-center text-[11px] font-bold uppercase tracking-[0.22em] text-violet-600 mb-3">
            Why Lucy
          </p>
          <h2 className="text-center text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900">
            {MANIFESTO_HEADING}
          </h2>
          <p className="text-center text-slate-500 max-w-2xl mx-auto mt-4 mb-12 leading-relaxed">
            {MANIFESTO_SUB}
          </p>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {PILLARS.map((p, i) => (
              <div
                key={p.kicker}
                className={`rounded-xl border p-7 ${
                  i === 1 ? 'border-violet-200 bg-violet-50/60' : 'border-slate-200 bg-white'
                }`}
              >
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-violet-600 mb-2">
                  {p.kicker}
                </p>
                <h3 className="text-lg font-extrabold tracking-tight text-slate-900 mb-2">{p.title}</h3>
                <p className="text-[13px] text-slate-500 leading-relaxed">{p.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Providers */}
        <section className="pb-20">
          <p className="text-center text-[11px] font-bold uppercase tracking-[0.22em] text-violet-600 mb-3">
            Every provider
          </p>
          <h2 className="text-center text-3xl font-extrabold tracking-tight text-slate-900">
            The models come to you
          </h2>
          <p className="text-center text-slate-500 max-w-2xl mx-auto mt-4 mb-12 leading-relaxed">
            Ten providers, twenty-five-plus models, one interface. Swap mid-conversation, mix cloud
            with local, and keep your conversation history either way.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {PROVIDER_CARDS.map((p) => (
              <div
                key={p.name}
                className="rounded-xl border border-slate-200 bg-white p-4 transition-all hover:border-violet-300 hover:shadow-[0_8px_30px_-12px_rgba(124,58,237,0.2)]"
              >
                <div className="flex items-center justify-between mb-3">
                  <Monogram
                    name={p.name}
                    color={p.name === 'Ollama' ? '#111111' : p.color}
                    fg={p.name === 'Ollama' ? '#ffffff' : p.fg}
                    className="w-9 h-9 rounded-lg text-sm"
                  />
                  {p.kind === 'local' && (
                    <span className="text-[9px] font-bold uppercase tracking-wide text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
                      Local
                    </span>
                  )}
                </div>
                <p className="text-sm font-bold text-slate-900 tracking-tight">{p.name}</p>
                <p className="text-[11px] text-slate-500 leading-snug mt-0.5">{p.models}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Marketplace */}
        <section className="pb-20">
          <p className="text-center text-[11px] font-bold uppercase tracking-[0.22em] text-violet-600 mb-3">
            Connector marketplace
          </p>
          <h2 className="text-center text-3xl font-extrabold tracking-tight text-slate-900">
            {MARKETPLACE_HEADING}
          </h2>
          <p className="text-center text-slate-500 max-w-2xl mx-auto mt-4 mb-12 leading-relaxed">
            {MARKETPLACE_SUB}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {CONNECTOR_TILES.map((c) => (
              <div
                key={c.name}
                className="group flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3.5 transition-all hover:border-violet-300"
              >
                <Monogram
                  name={c.name}
                  color={c.name === 'Notion' ? '#111111' : c.color}
                  fg={c.name === 'Notion' ? '#ffffff' : c.fg}
                  className="w-8 h-8 rounded-lg text-xs"
                />
                <div className="min-w-0">
                  <p className="text-[13px] font-bold text-slate-900 tracking-tight truncate">{c.name}</p>
                  <p className="text-[10px] text-slate-400 group-hover:text-violet-600 transition-colors">
                    One-click install
                  </p>
                </div>
              </div>
            ))}
          </div>
          <p className="text-center text-xs text-slate-400 mt-6">
            Secrets encrypted at rest · write actions can require approval · runs on the open MCP standard
          </p>
        </section>
      </div>

      {/* Features — full-width tinted band */}
      <section className="bg-slate-50 border-y border-slate-100 py-20">
        <div className="max-w-6xl mx-auto px-6">
          <p className="text-center text-[11px] font-bold uppercase tracking-[0.22em] text-violet-600 mb-3">
            Powerful features
          </p>
          <h2 className="text-center text-3xl font-extrabold tracking-tight text-slate-900 mb-12">
            Everything between you and every model
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="rounded-xl border border-slate-200 bg-white p-6 transition-all hover:border-violet-300 hover:shadow-[0_8px_30px_-12px_rgba(124,58,237,0.25)]"
              >
                <div className="w-9 h-9 rounded-lg bg-violet-50 border border-violet-100 flex items-center justify-center mb-4">
                  <f.icon className="w-[18px] h-[18px] text-violet-600" />
                </div>
                <h3 className="text-[15px] font-bold text-slate-900 tracking-tight mb-1.5">{f.title}</h3>
                <p className="text-[13px] text-slate-500 leading-relaxed">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="max-w-6xl mx-auto px-6">
        {/* Integrate */}
        <section className="pt-20">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-violet-600 mb-3">
                Integration
              </p>
              <h2 className="text-3xl font-extrabold tracking-tight text-slate-900 mb-6">
                {INTEGRATE_HEADING}
              </h2>
              <dl className="space-y-5">
                {INTEGRATE_POINTS.map(([title, body]) => (
                  <div key={title} className="flex gap-3">
                    <CheckCircle2 className="w-4 h-4 text-violet-600 mt-0.5 shrink-0" />
                    <div>
                      <dt className="text-sm font-bold text-slate-900 tracking-tight">{title}</dt>
                      <dd className="text-[13px] text-slate-500 leading-relaxed mt-0.5">{body}</dd>
                    </div>
                  </div>
                ))}
              </dl>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-900 overflow-hidden shadow-[0_24px_60px_-24px_rgba(15,23,42,0.3)]">
              <div className="flex items-center gap-1.5 px-4 py-3 border-b border-slate-700">
                <span className="w-2.5 h-2.5 rounded-full bg-red-400/70" />
                <span className="w-2.5 h-2.5 rounded-full bg-yellow-400/70" />
                <span className="w-2.5 h-2.5 rounded-full bg-green-400/70" />
                <span className="ml-2 text-[11px] text-slate-400 font-mono">anywhere-in-your-app.html</span>
              </div>
              <pre className="p-5 text-[12px] leading-relaxed font-mono text-violet-200 whitespace-pre-wrap break-all">
                {EMBED_SNIPPET}
              </pre>
              <p className="px-5 pb-5 text-xs text-slate-400">
                That&rsquo;s the whole integration. Lucy appears as a widget inside your product,
                already aware of your business data.
              </p>
            </div>
          </div>
        </section>

        {/* Terminal */}
        <section className="pt-20">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
            <div className="rounded-xl bg-slate-900 overflow-hidden shadow-[0_24px_60px_-24px_rgba(15,23,42,0.3)] font-mono text-[12.5px] leading-relaxed order-2 lg:order-1">
              <div className="flex items-center gap-1.5 px-4 py-3 border-b border-slate-700">
                <span className="w-2.5 h-2.5 rounded-full bg-red-400/70" />
                <span className="w-2.5 h-2.5 rounded-full bg-yellow-400/70" />
                <span className="w-2.5 h-2.5 rounded-full bg-green-400/70" />
                <span className="ml-2 text-[11px] text-slate-400">terminal</span>
              </div>
              <div className="p-5 space-y-1.5">
                <p><span className="text-slate-500">$</span> <span className="text-slate-200">lucy chat</span></p>
                <p><span className="text-violet-300 font-bold">you ›</span> <span className="text-slate-300">what did we decide about the Q3 launch?</span></p>
                <p><span className="text-violet-400 font-bold">lucy ›</span> <span className="text-slate-400">You moved it to October 14 and cut the beta waitlist — decided last Tuesday with Sara.</span></p>
                <p className="pt-2"><span className="text-slate-500">$</span> <span className="text-slate-200">cat error.log | lucy chat <span className="text-emerald-300">&quot;explain this&quot;</span></span></p>
                <p><span className="text-slate-500">$</span> <span className="text-slate-200">lucy memories remember <span className="text-emerald-300">&quot;staging DB is on port 6543&quot;</span></span></p>
                <p><span className="text-green-400">✓ saved</span></p>
              </div>
            </div>
            <div className="order-1 lg:order-2">
              <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-violet-600 mb-3">
                Two surfaces, one brain
              </p>
              <h2 className="text-3xl font-extrabold tracking-tight text-slate-900 mb-4">
                Also in your terminal
              </h2>
              <p className="text-slate-500 leading-relaxed mb-4">
                The Lucy CLI is a thin client over the same API — streaming chat, model switching,
                memory commands, and admin tools from any shell. Pipe logs into it, script it,
                keep it in a tmux pane.
              </p>
              <p className="text-[13px] text-slate-400 leading-relaxed">
                Same memory, same encrypted keys, same walls. One <span className="text-violet-600 font-mono">lucy login</span> and
                your terminal knows everything your browser does.
              </p>
            </div>
          </div>
        </section>

        {/* Themes strip */}
        <section className="py-20">
          <div className="rounded-xl border border-slate-200 p-8 flex flex-col sm:flex-row items-center gap-6">
            <div className="flex-1">
              <h3 className="text-xl font-extrabold tracking-tight text-slate-900">Make it yours</h3>
              <p className="text-sm text-slate-500 mt-1">
                Five built-in themes — from corporate light to editorial dark — switch the whole interface in one click.
              </p>
            </div>
            <div className="flex gap-2">
              {[
                ['#fafafc', '#7c3aed'], ['#0c0a16', '#8b5cf6'], ['#0a0a0f', '#3f3f5a'],
                ['#050507', '#8b5cf6'], ['#030712', '#374151'],
              ].map(([bg, accent], i) => (
                <div key={i} className="w-12 h-9 rounded-lg overflow-hidden border border-slate-200 flex">
                  <div style={{ background: bg }} className="flex-1" />
                  <div style={{ background: accent }} className="w-1.5" />
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Banner */}
        <section className="pb-20 text-center">
          <div className="rounded-2xl bg-slate-900 px-8 py-14">
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-[-0.02em] text-white max-w-3xl mx-auto leading-snug">
              {BANNER}
            </h2>
            <p className="text-slate-400 max-w-2xl mx-auto mt-4 leading-relaxed">
              {BANNER_SUB}
            </p>
            <ul className="mt-6 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-slate-300">
              {['No per-seat pricing', 'Bring your own keys', 'Deploy in minutes with Docker'].map((t) => (
                <li key={t} className="inline-flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-violet-400" /> {t}
                </li>
              ))}
            </ul>
            <Link
              href="/chat"
              className="mt-8 inline-flex items-center gap-2 text-sm font-bold text-slate-900 bg-white hover:bg-slate-100 rounded-lg px-7 py-3 transition-colors"
            >
              Try Lucy now <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-slate-100 py-10">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 mb-8">
            {FOOTER_BADGES.map(([a, b]) => (
              <div key={a} className="text-center">
                <p className="text-sm font-bold text-slate-900">{a}</p>
                <p className="text-xs text-slate-400">{b}</p>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-center gap-4 text-xs text-slate-400">
            <span>© {new Date().getFullYear()} Lucy AI</span>
            <span>·</span>
            <Link href="/docs" className="hover:text-slate-600 transition-colors">
              Docs
            </Link>
            <span>·</span>
            <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="hover:text-slate-600 transition-colors">
              Open source on GitHub
            </a>
          </div>
        </footer>
      </div>
    </div>
  );
}
