'use client';

import React from 'react';

export function TypingIndicator() {
  return (
    <div className="flex items-center gap-2 px-1">
      <div className="flex items-center gap-1">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="w-2 h-2 rounded-full bg-lucy-400"
            style={{
              animation: 'pulseDot 1.4s ease-in-out infinite',
              animationDelay: `${i * 0.16}s`,
            }}
          />
        ))}
      </div>
      <span className="text-xs text-t3">Lucy is typing…</span>
    </div>
  );
}
