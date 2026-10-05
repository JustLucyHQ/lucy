// lib/security/escape-html.ts — escape a value before it is interpolated into HTML (e-mail bodies, etc.).

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Escape &, <, >, " and ' so the value is safe in HTML text and in quoted attribute values. */
export const esc = (value: unknown): string => String(value ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c]!);
