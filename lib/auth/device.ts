function fingerprint(): string {
  const parts = [navigator.userAgent, navigator.language, `${screen.width}x${screen.height}`,
    Intl.DateTimeFormat().resolvedOptions().timeZone];
  let h = 0; const s = parts.join('|');
  for (let i = 0; i < s.length; i++) { h = ((h << 5) - h) + s.charCodeAt(i); h |= 0; }
  return Math.abs(h).toString(36);
}
function parseUA(ua: string): { browser: string; os: string; deviceType: string } {
  const browser = /edg/i.test(ua) ? 'Edge' : /chrome/i.test(ua) ? 'Chrome' : /firefox/i.test(ua) ? 'Firefox' : /safari/i.test(ua) ? 'Safari' : 'Browser';
  const os = /windows/i.test(ua) ? 'Windows' : /mac/i.test(ua) ? 'macOS' : /android/i.test(ua) ? 'Android' : /linux/i.test(ua) ? 'Linux' : /iphone|ipad/i.test(ua) ? 'iOS' : 'Unknown';
  const deviceType = /mobile|android|iphone/i.test(ua) ? 'mobile' : 'desktop';
  return { browser, os, deviceType };
}
async function fetchIp(): Promise<string | null> {
  try { const r = await fetch('https://api.ipify.org?format=json'); if (!r.ok) return null; return (await r.json()).ip ?? null; } catch { return null; }
}

/** Fire-and-forget device registration after login. */
export async function trackDevice(): Promise<void> {
  if (typeof navigator === 'undefined') return;
  const ua = navigator.userAgent;
  const { browser, os, deviceType } = parseUA(ua);
  const ip = await fetchIp();
  await fetch('/api/auth/devices/track', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fingerprint: fingerprint(), browser, os, deviceType, ipAddress: ip,
      deviceName: `${browser} on ${os}` }),
  }).catch(() => {});
}
