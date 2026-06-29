/**
 * First-run onboarding flag (standalone/desktop).
 *
 * In standalone mode there is no account, so "has this install been set up?"
 * is tracked with a single localStorage flag. The chat page reads it to decide
 * whether to bounce a fresh user into the onboarding wizard; the wizard and the
 * settings store set it once the user has chosen how to power Lucy.
 */

const ONBOARDED_KEY = 'lucy.onboarded';

/** True once the user has completed (or skipped past) first-run onboarding. */
export function isOnboarded(): boolean {
  try {
    return typeof window !== 'undefined' && localStorage.getItem(ONBOARDED_KEY) === '1';
  } catch {
    return false;
  }
}

/** Mark this install as set up so the first-run wizard isn't shown again. */
export function markOnboarded(): void {
  try {
    if (typeof window !== 'undefined') localStorage.setItem(ONBOARDED_KEY, '1');
  } catch {
    /* non-fatal */
  }
}
