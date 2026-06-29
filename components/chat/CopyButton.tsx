'use client';

import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';

/** Small copy-to-clipboard button — shared by ChatMessage and code blocks. */
export function CopyButton({ text, className = '' }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard not available
    }
  };

  return (
    <button
      onClick={handleCopy}
      className={`p-1.5 rounded-md text-t3 hover:text-t2 hover:bg-raised transition-colors ${className}`}
      title="Copy"
      aria-label="Copy to clipboard"
    >
      {copied ? (
        <Check className="w-3.5 h-3.5 text-green-400" />
      ) : (
        <Copy className="w-3.5 h-3.5" />
      )}
    </button>
  );
}
