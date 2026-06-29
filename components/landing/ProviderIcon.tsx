'use client';
import type { ComponentType } from 'react';
import {
  OpenAI, Claude, Gemini, Mistral, Ollama, Groq, DeepSeek,
} from '@lobehub/icons';

type IconProps = { size?: number; className?: string };
type IconLike = ComponentType<IconProps> & { Color?: ComponentType<IconProps> };

/** Maps a PROVIDERS label to its brand icon (xAI → Grok). */
const MAP: Record<string, IconLike> = {
  OpenAI: OpenAI as IconLike,
  Claude: Claude as IconLike,
  Gemini: Gemini as IconLike,
  Mistral: Mistral as IconLike,
  Ollama: Ollama as IconLike,
  Groq: Groq as IconLike,
  DeepSeek: DeepSeek as IconLike,
};

/** Renders the company brand icon for a provider name; full-color where available. */
export function ProviderIcon({ name, size = 16 }: { name: string; size?: number }) {
  const Cmp = MAP[name];
  if (!Cmp) return null;
  const Colored = Cmp.Color ?? Cmp;
  return <Colored size={size} />;
}
