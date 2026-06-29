'use client';
import { ProviderIcon } from './ProviderIcon';
import { PROVIDERS } from './features';

/**
 * Hero "connected to every provider" graphic: animated dashed lines fan out
 * from the chat above down to a row of provider brand tiles.
 *
 * The connector is an SVG bus-and-drops overlay (desktop only); on mobile the
 * tiles wrap without lines.
 */
const TILES = PROVIDERS; // 7 brand tiles
const COLS = TILES.length + 1; // + a "more" tile

// x position (in the 0..1000 viewBox) of each grid column's center.
const XS = Array.from({ length: COLS }, (_, i) =>
  Number((((i + 0.5) / COLS) * 1000).toFixed(1)),
);
const BUS_Y = 12;
const DROP_BOTTOM = 56;

// Connector signal timing: every dot moves at the SAME speed. The cycle has two
// phases — the left four fire together; once they've all arrived + vanished (a
// short pause) the right four fire; then the whole cycle repeats.
const SIGNAL_SPEED = 250; // viewBox units per second
const SIGNAL_PAUSE = 0.4; // seconds a group stays vanished before the next phase
const SIGNAL_LENS = XS.map((x) => DROP_BOTTOM - BUS_Y + Math.abs(x - 500) + BUS_Y);
// One phase: longest path in a group travels, then a pause where all are gone.
const SIGNAL_PHASE = Math.max(...SIGNAL_LENS) / SIGNAL_SPEED + SIGNAL_PAUSE;
// Full cycle = left phase + right phase.
const SIGNAL_T = SIGNAL_PHASE * 2;

function Tile({ children, label }: { children: React.ReactNode; label?: string }) {
  return (
    <div className="group relative aspect-square rounded-2xl border border-white/[0.08] bg-[#14121f]/80 flex flex-col items-center justify-center gap-1 transition-all hover:border-lucy-500/45 hover:bg-lucy-500/[0.06] hover:shadow-[0_0_28px_rgba(139,92,246,0.28)]">
      {children}
      {label && (
        <span className="text-[10px] font-semibold text-gray-500 group-hover:text-gray-300 transition-colors">
          {label}
        </span>
      )}
    </div>
  );
}

export function ProviderConstellation() {
  return (
    <div className="mt-0">
      <style>{`@keyframes lucyDashFlow { to { stroke-dashoffset: -28; } }`}</style>

      {/* Connector: chat → providers (desktop) */}
      <div className="relative hidden sm:block">
        <svg
          className="w-full"
          height="58"
          viewBox="0 0 1000 58"
          preserveAspectRatio="none"
          fill="none"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="lucy-conn" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#a855f7" />
              <stop offset="1" stopColor="#7c3aed" />
            </linearGradient>
            <filter id="lucy-conn-glow" x="-20%" y="-50%" width="140%" height="200%">
              <feGaussianBlur stdDeviation="2.4" />
            </filter>
            <filter id="lucy-signal-glow" x="-500%" y="-500%" width="1100%" height="1100%">
              <feGaussianBlur stdDeviation="3" result="wide" />
              <feGaussianBlur stdDeviation="1" result="tight" />
              <feMerge>
                <feMergeNode in="wide" />
                <feMergeNode in="tight" />
                <feMergeNode in="tight" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {(() => {
            const stem = `M500 0 V ${BUS_Y}`;
            const bus = `M${XS[0]} ${BUS_Y} H ${XS[COLS - 1]}`;
            const drops = XS.map((x) => `M${x} ${BUS_Y} V ${DROP_BOTTOM}`).join(' ');
            const all = `${stem} ${bus} ${drops}`;
            return (
              <>
                {/* soft glow underlay */}
                <path d={all} stroke="url(#lucy-conn)" strokeWidth="3" opacity="0.35" filter="url(#lucy-conn-glow)" />
                {/* crisp animated dashed line */}
                <path
                  d={all}
                  stroke="url(#lucy-conn)"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeDasharray="1 7"
                  vectorEffect="non-scaling-stroke"
                  style={{ animation: 'lucyDashFlow 1.1s linear infinite' }}
                />
              </>
            );
          })()}

          {/* glowing signals provider → drop → bus → stem → Lucy:
              same speed for all. Left four fire (phase 0); once they vanish the
              right four fire (phase 0.5); then the cycle repeats. */}
          {XS.map((x, i) => {
            // full path: up the drop, along the bus to centre, up the stem to Lucy
            const path = `M${x} ${DROP_BOTTOM} L${x} ${BUS_Y} L500 ${BUS_Y} L500 0`;
            const r3 = (n: number) => n.toFixed(3);
            // fraction of the full cycle this dot spends travelling (constant speed)
            const f = SIGNAL_LENS[i] / SIGNAL_SPEED / SIGNAL_T;
            const fin = f * 0.08;
            const fout = f * 0.9;
            // phase start: left four at 0, right four at the cycle midpoint
            const s = i < COLS / 2 ? 0 : SIGNAL_PHASE / SIGNAL_T;
            const dur = `${SIGNAL_T.toFixed(3)}s`;

            const motionKeyPoints = s === 0 ? '0;1;1' : '0;0;1;1';
            const motionKeyTimes = s === 0
              ? `0;${r3(f)};1`
              : `0;${r3(s)};${r3(s + f)};1`;
            const opacityValues = s === 0 ? '0;1;1;0;0' : '0;0;1;1;0;0';
            const opacityKeyTimes = s === 0
              ? `0;${r3(fin)};${r3(fout)};${r3(f)};1`
              : `0;${r3(s)};${r3(s + fin)};${r3(s + fout)};${r3(s + f)};1`;

            return (
              <ellipse key={x} rx="3.9" ry="3" fill="#d8b4fe" opacity="0" filter="url(#lucy-signal-glow)">
                <animateMotion
                  path={path}
                  dur={dur}
                  keyPoints={motionKeyPoints}
                  keyTimes={motionKeyTimes}
                  calcMode="linear"
                  repeatCount="indefinite"
                />
                <animate
                  attributeName="opacity"
                  values={opacityValues}
                  keyTimes={opacityKeyTimes}
                  dur={dur}
                  repeatCount="indefinite"
                />
              </ellipse>
            );
          })}
        </svg>
      </div>

      {/* Provider tiles */}
      <div className="grid grid-cols-4 sm:grid-cols-8 gap-3 sm:-mt-1">
        {TILES.map((p) => (
          <Tile key={p} label={p}>
            <ProviderIcon name={p} size={24} />
          </Tile>
        ))}
        <Tile label="& more">
          <span className="text-lg font-extrabold text-lucy-300 leading-none">+</span>
        </Tile>
      </div>
    </div>
  );
}
