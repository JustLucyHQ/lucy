// instrumentation.ts
/**
 * Next.js server-boot hook. Starts the workflow worker once, only on the Node
 * runtime and only in connected mode (Supabase configured) — so the desktop
 * standalone server never runs it.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (!(process.env.SUPABASE_INTERNAL_URL || process.env.NEXT_PUBLIC_SUPABASE_URL) || !process.env.SUPABASE_SERVICE_ROLE_KEY) return;
  const { startWorkflowWorker } = await import('./lib/workflow/worker');
  startWorkflowWorker();
}
