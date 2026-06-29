// lib/workflow/cron.ts
/** Cron validation + next-run computation (thin wrapper over cron-parser v4). */
import { parseExpression } from 'cron-parser';

export function isValidCron(expr: string): boolean {
  try {
    parseExpression(expr);
    return true;
  } catch {
    return false;
  }
}

/** Next fire time strictly after `after`, or null if the expression is invalid. */
export function nextRunAfter(expr: string, after: Date, timezone?: string): Date | null {
  try {
    const it = parseExpression(expr, { currentDate: after, tz: timezone });
    return it.next().toDate();
  } catch {
    return null;
  }
}
