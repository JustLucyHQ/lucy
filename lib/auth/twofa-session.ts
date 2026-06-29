const KEY = 'lucy-2fa-passed';
export function set2faPassed(userId: string): void { try { sessionStorage.setItem(KEY, userId); } catch {} }
export function is2faPassed(userId?: string | null): boolean {
  if (typeof window === 'undefined' || !userId) return false;
  try { return sessionStorage.getItem(KEY) === userId; } catch { return false; }
}
export function clear2faPassed(): void { try { sessionStorage.removeItem(KEY); } catch {} }
