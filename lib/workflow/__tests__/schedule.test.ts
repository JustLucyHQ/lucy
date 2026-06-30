import { compileSchedule, nextRuns } from '../schedule';

describe('compileSchedule', () => {
  it('compiles each recurring mode to the right cron', () => {
    expect(compileSchedule({ mode: 'hour', minute: 30 }).cron).toBe('30 * * * *');
    expect(compileSchedule({ mode: 'day', time: '09:00' }).cron).toBe('0 9 * * *');
    expect(compileSchedule({ mode: 'weekday', time: '08:15' }).cron).toBe('15 8 * * 1-5');
    expect(compileSchedule({ mode: 'week', time: '09:00', dow: 1 }).cron).toBe('0 9 * * 1');
    expect(compileSchedule({ mode: 'month', time: '09:00', dom: 1 }).cron).toBe('0 9 1 * *');
    expect(compileSchedule({ mode: 'mins', every: 5 }).cron).toBe('*/5 * * * *');
    expect(compileSchedule({ mode: 'custom', expr: '*/10 * * * *' }).cron).toBe('*/10 * * * *');
  });

  it('carries the timezone through', () => {
    expect(compileSchedule({ mode: 'day', time: '09:00', timezone: 'Europe/Zagreb' }).timezone).toBe('Europe/Zagreb');
  });

  it('compiles one-time to a runOnceAt instant (no cron)', () => {
    const c = compileSchedule({ mode: 'once', date: '2026-07-15', time: '14:00' });
    expect(c.cron).toBeUndefined();
    expect(c.runOnceAt).toBe('2026-07-15T14:00:00');
  });

  it('clamps out-of-range fields', () => {
    expect(compileSchedule({ mode: 'mins', every: 0 }).cron).toBe('*/1 * * * *');
    expect(compileSchedule({ mode: 'month', time: '09:00', dom: 99 }).cron).toBe('0 9 31 * *');
  });
});

describe('nextRuns', () => {
  it('returns N upcoming run times for a valid cron', () => {
    const runs = nextRuns('0 9 * * *', 'UTC', 3, new Date('2026-07-01T00:00:00Z'));
    expect(runs).toHaveLength(3);
    expect(runs[0]).toBe('2026-07-01T09:00:00.000Z');
    expect(runs[1]).toBe('2026-07-02T09:00:00.000Z');
  });

  it('returns [] for an invalid cron', () => {
    expect(nextRuns('not a cron', 'UTC')).toEqual([]);
  });
});
