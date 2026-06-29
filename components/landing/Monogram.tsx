/** Brand-colored monogram tile — uniform stand-in for provider/connector logos. */

const GLYPHS: Record<string, string> = {
  'LM Studio': 'LM',
  xAI: 'X',
  OpenRouter: 'OR',
  'Brave Search': 'B',
  'Your own app': '+',
};

export function Monogram({
  name,
  color,
  fg = '#ffffff',
  className = 'w-9 h-9 rounded-xl text-sm',
}: {
  name: string;
  color: string;
  fg?: string;
  className?: string;
}) {
  const glyph = GLYPHS[name] ?? name[0].toUpperCase();
  return (
    <div
      aria-hidden
      style={{ background: color, color: fg }}
      className={`flex items-center justify-center font-extrabold tracking-tight shrink-0 ${className}`}
    >
      {glyph}
    </div>
  );
}
