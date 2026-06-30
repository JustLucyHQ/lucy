'use client';

import { useMemo, useState } from 'react';
import { compileSchedule, nextRuns, type ScheduleMode } from '@/lib/workflow/schedule';

const MODES: { k: ScheduleMode; label: string }[] = [
  { k: 'hour', label: 'Every hour' },
  { k: 'day', label: 'Every day' },
  { k: 'weekday', label: 'Every weekday' },
  { k: 'week', label: 'Every week' },
  { k: 'month', label: 'Every month' },
  { k: 'mins', label: 'Every few minutes' },
  { k: 'once', label: 'One time only' },
  { k: 'custom', label: 'Custom (cron)' },
];
const DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const TZS = ['UTC', 'Europe/Zagreb', 'Europe/London', 'America/New_York', 'America/Los_Angeles', 'Asia/Tokyo'];

interface Props {
  busy: boolean;
  onCancel: () => void;
  onAdd: (settings: Record<string, unknown>) => void;
}

export function ScheduleBuilder({ busy, onCancel, onAdd }: Props) {
  const [mode, setMode] = useState<ScheduleMode>('day');
  const [minute, setMinute] = useState(0);
  const [time, setTime] = useState('09:00');
  const [dow, setDow] = useState(1);
  const [dom, setDom] = useState(1);
  const [every, setEvery] = useState(5);
  const [date, setDate] = useState('');
  const [expr, setExpr] = useState('0 9 * * *');
  const [timezone, setTimezone] = useState('UTC');

  const compiled = useMemo(
    () => compileSchedule({ mode, minute, time, dow, dom, every, date, expr, timezone }),
    [mode, minute, time, dow, dom, every, date, expr, timezone],
  );
  const preview = useMemo(
    () => (compiled.cron ? nextRuns(compiled.cron, timezone, 3) : compiled.runOnceAt ? [compiled.runOnceAt] : []),
    [compiled, timezone],
  );

  const add = () => {
    if (compiled.runOnceAt !== undefined) {
      if (!compiled.runOnceAt) return;
      onAdd({ run_once: true, run_at: compiled.runOnceAt, timezone });
    } else {
      onAdd({ expr: compiled.cron, timezone });
    }
  };

  const inp = 'bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200';
  return (
    <div className="rounded-lg border border-gray-700 bg-gray-800 p-2.5 space-y-2.5">
      <div className="grid grid-cols-2 gap-1.5">
        {MODES.map((m) => (
          <button
            key={m.k}
            onClick={() => setMode(m.k)}
            className={`text-left text-xs px-2 py-1.5 rounded border ${
              mode === m.k ? 'border-lucy-500 bg-lucy-600/20 text-lucy-200' : 'border-gray-700 text-gray-300 hover:bg-gray-700/50'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-gray-400">
        {mode === 'hour' && (<>at minute <input type="number" min={0} max={59} value={minute} onChange={(e) => setMinute(+e.target.value)} className={`${inp} w-16`} /></>)}
        {(mode === 'day' || mode === 'weekday') && (<>at <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={inp} /></>)}
        {mode === 'week' && (<>on <select value={dow} onChange={(e) => setDow(+e.target.value)} className={inp}>{DOW.map((d, i) => <option key={d} value={i}>{d}</option>)}</select> at <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={inp} /></>)}
        {mode === 'month' && (<>on day <input type="number" min={1} max={31} value={dom} onChange={(e) => setDom(+e.target.value)} className={`${inp} w-16`} /> at <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={inp} /></>)}
        {mode === 'mins' && (<>every <input type="number" min={1} value={every} onChange={(e) => setEvery(+e.target.value)} className={`${inp} w-16`} /> minutes</>)}
        {mode === 'once' && (<>on <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inp} /> at <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={inp} /></>)}
        {mode === 'custom' && (<input type="text" value={expr} onChange={(e) => setExpr(e.target.value)} className={`${inp} w-full font-mono`} placeholder="0 9 * * *" />)}
      </div>

      <label className="block text-xs text-gray-500">
        Timezone
        <select value={timezone} onChange={(e) => setTimezone(e.target.value)} className={`${inp} w-full mt-1`}>
          {TZS.map((z) => <option key={z} value={z}>{z}</option>)}
        </select>
      </label>

      <div className="text-xs text-gray-600 border-t border-gray-700/60 pt-2">
        <div className="text-gray-500">next runs</div>
        {preview.length ? preview.map((p, i) => <div key={i} className="text-gray-400">{new Date(p).toLocaleString()}</div>) : <div>—</div>}
        {compiled.cron && <div className="font-mono text-gray-600 mt-1">{compiled.cron}</div>}
      </div>

      <div className="flex gap-2">
        <button disabled={busy || (mode === 'once' && !date)} onClick={add} className="px-2 py-1 rounded bg-lucy-600 text-white text-xs disabled:opacity-50">Add schedule</button>
        <button onClick={onCancel} className="px-2 py-1 text-gray-400 text-xs">Cancel</button>
      </div>
    </div>
  );
}
