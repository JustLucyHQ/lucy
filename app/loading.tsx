import React from 'react';
import { LucyMark } from '@/components/brand/LucyMark';

export default function Loading() {
  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <LucyMark className="w-12 h-12 rounded-xl animate-pulse" />
        <div className="flex gap-1">
          <span className="w-2 h-2 rounded-full bg-lucy-500 animate-bounce [animation-delay:0ms]" />
          <span className="w-2 h-2 rounded-full bg-lucy-500 animate-bounce [animation-delay:150ms]" />
          <span className="w-2 h-2 rounded-full bg-lucy-500 animate-bounce [animation-delay:300ms]" />
        </div>
      </div>
    </div>
  );
}
