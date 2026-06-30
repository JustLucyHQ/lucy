// lib/workflow/schedule.ts
// Friendly schedule builder → cron (or a one-time instant). The UI picks a
// plain-language mode + a couple of fields; this compiles it to what the engine
// already understands (a cron expression, or a run_once timestamp for one-time).
import { parseExpression } from 'cron-parser';

export type ScheduleMode = 'hour' | 'day' | 'weekday' | 'week' | 'month' | 'mins' | 'once' | 'custom';

export interface ScheduleInput {
  mode: ScheduleMode;
  minute?: number; // hour: at minute N
  time?: string; // 'HH:MM' for day/weekday/week/month/once
  dow?: number; // 0=Sun … 6=Sat, for week
  dom?: number; // 1..31, for month
  every?: number; // mins: every N minutes
  date?: string; // 'YYYY-MM-DD', for once
  expr?: string; // custom cron
  timezone?: string;
}

export interface CompiledSchedule {
  cron?: string;
  runOnceAt?: string; // local ISO (no offset) for one-time
  timezone?: string;
}

function hm(time?: string): [number, number] {
  const [h, m] = (time || '09:00').split(':').map((x) => parseInt(x, 10));
  return [Number.isFinite(h) ? Math.min(23, Math.max(0, h)) : 9, Number.isFinite(m) ? Math.min(59, Math.max(0, m)) : 0];
}

export function compileSchedule(i: ScheduleInput): CompiledSchedule {
  const tz = i.timezone || undefined;
  switch (i.mode) {
    case 'hour':
      return { cron: `${Math.min(59, Math.max(0, i.minute ?? 0))} * * * *`, timezone: tz };
    case 'day': {
      const [h, m] = hm(i.time);
      return { cron: `${m} ${h} * * *`, timezone: tz };
    }
    case 'weekday': {
      const [h, m] = hm(i.time);
      return { cron: `${m} ${h} * * 1-5`, timezone: tz };
    }
    case 'week': {
      const [h, m] = hm(i.time);
      return { cron: `${m} ${h} * * ${i.dow ?? 1}`, timezone: tz };
    }
    case 'month': {
      const [h, m] = hm(i.time);
      return { cron: `${m} ${h} ${Math.min(31, Math.max(1, i.dom ?? 1))} * *`, timezone: tz };
    }
    case 'mins':
      return { cron: `*/${Math.max(1, i.every ?? 5)} * * * *`, timezone: tz };
    case 'once': {
      const [h, m] = hm(i.time);
      const d = i.date || '';
      const iso = d ? `${d}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00` : '';
      return { runOnceAt: iso, timezone: tz };
    }
    case 'custom':
    default:
      return { cron: i.expr || '0 9 * * *', timezone: tz };
  }
}

/** Next N fire times for a cron expression (ISO), for the UI preview. Empty on invalid. */
export function nextRuns(cron: string, timezone: string | undefined, n = 3, after: Date = new Date()): string[] {
  try {
    const it = parseExpression(cron, { currentDate: after, tz: timezone });
    const out: string[] = [];
    for (let k = 0; k < n; k++) out.push(it.next().toDate().toISOString());
    return out;
  } catch {
    return [];
  }
}
