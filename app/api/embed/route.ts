/**
 * Embed loader — one <script> tag mounts a chat widget on any site:
 *
 *   <script src="https://justlucy.ai/api/embed?w=<widgetId>" async></script>
 *
 * Each widget is configured by its owner (persona, FAQ, model, look) in
 * Settings → Chat Widgets. The owner's API key is used server-side by
 * /api/embed-chat — visitors never enter a key.
 *
 * The script injects a floating launcher button plus a hidden <iframe> that
 * points at /embed?w=<id> (the chat panel). Clicking the launcher toggles the
 * panel. No React is loaded into the host page; the iframe is fully isolated.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getWidget } from '@/lib/embed/widgets';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const origin = process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin;
  const id = (req.nextUrl.searchParams.get('w') || '').replace(/[^a-zA-Z0-9_-]/g, '');

  if (!id) {
    return new NextResponse(
      `console.error("[Lucy embed] Missing ?w=<widgetId>. Create a widget in Settings → Chat Widgets and copy its snippet.");`,
      { headers: { 'Content-Type': 'application/javascript; charset=utf-8', 'Access-Control-Allow-Origin': '*' } },
    );
  }

  const widget = await getWidget(id);
  if (!widget) {
    return new NextResponse(
      `console.error("[Lucy embed] Widget not found: ${id}");`,
      { headers: { 'Content-Type': 'application/javascript; charset=utf-8', 'Access-Control-Allow-Origin': '*' } },
    );
  }

  const accent = /^#[0-9a-fA-F]{6}$/.test(widget.accent) ? widget.accent : '#7c3aed';
  const side = (widget.position || 'bottom-right').includes('left') ? 'left' : 'right';
  const label = (widget.launcher_label || 'Chat with us').replace(/[<>"]/g, '');

  const CHAT_ICON =
    '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
  const CLOSE_ICON =
    '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';

  const script = `
(function () {
  'use strict';
  if (window.__lucyWidget_${id}) return;
  window.__lucyWidget_${id} = true;

  var ORIGIN = ${JSON.stringify(origin)};
  var WID = ${JSON.stringify(id)};
  var SIDE = ${JSON.stringify(side)};
  var ACCENT = ${JSON.stringify(accent)};
  var CHAT = ${JSON.stringify(CHAT_ICON)};
  var CLOSE = ${JSON.stringify(CLOSE_ICON)};

  function mount() {
    var frame = document.createElement('iframe');
    frame.src = ORIGIN + '/embed?w=' + encodeURIComponent(WID);
    frame.title = ${JSON.stringify(label)};
    frame.setAttribute('allow', 'clipboard-write');
    frame.style.cssText = [
      'position:fixed', 'bottom:90px', SIDE + ':20px',
      'width:384px', 'max-width:calc(100vw - 40px)',
      'height:600px', 'max-height:calc(100vh - 120px)',
      'border:none', 'border-radius:16px',
      'box-shadow:0 24px 64px rgba(0,0,0,0.35)',
      'z-index:2147483647', 'background:transparent', 'display:none',
      'opacity:0', 'transition:opacity .18s ease'
    ].join(';');

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute('aria-label', ${JSON.stringify(label)});
    btn.innerHTML = CHAT;
    btn.style.cssText = [
      'position:fixed', 'bottom:20px', SIDE + ':20px',
      'width:56px', 'height:56px', 'border-radius:9999px', 'border:none',
      'cursor:pointer', 'background:' + ACCENT,
      'box-shadow:0 8px 24px rgba(0,0,0,0.25)', 'z-index:2147483646',
      'display:flex', 'align-items:center', 'justify-content:center'
    ].join(';');

    var open = false;
    function toggle() {
      open = !open;
      if (open) {
        frame.style.display = 'block';
        requestAnimationFrame(function () { frame.style.opacity = '1'; });
        btn.innerHTML = CLOSE;
      } else {
        frame.style.opacity = '0';
        btn.innerHTML = CHAT;
        setTimeout(function () { if (!open) frame.style.display = 'none'; }, 180);
      }
    }
    btn.addEventListener('click', toggle);

    window.addEventListener('message', function (e) {
      if (e.origin !== ORIGIN) return;
      if (e.data === 'lucy:close' && open) toggle();
    });

    document.body.appendChild(frame);
    document.body.appendChild(btn);
  }

  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount);
})();
`.trim();

  return new NextResponse(script, {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'public, max-age=120, s-maxage=120',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
