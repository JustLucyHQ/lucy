import React from 'react';

/**
 * Skeleton loader shown while the chat page JS is loading.
 * Mirrors the basic layout (header + sidebar + main area).
 */
export default function ChatLoading() {
  return (
    <div className="flex flex-col h-screen bg-gray-950 animate-pulse">
      {/* Header skeleton */}
      <div className="h-14 border-b border-gray-800 bg-gray-900 flex items-center px-4 gap-3 shrink-0">
        <div className="w-7 h-7 rounded-lg bg-gray-700" />
        <div className="w-16 h-4 rounded bg-gray-700" />
        <div className="hidden sm:flex gap-2 ml-4">
          {[70, 90, 80, 70, 90].map((w, i) => (
            <div key={i} className="h-6 rounded-md bg-gray-800" style={{ width: w }} />
          ))}
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar skeleton */}
        <div className="w-64 shrink-0 hidden sm:flex flex-col bg-gray-900 border-r border-gray-800 p-3 gap-2">
          <div className="h-8 rounded-md bg-gray-800 w-full" />
          <div className="mt-2 space-y-1">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="h-7 rounded-md bg-gray-800/60 w-full" />
            ))}
          </div>
        </div>

        {/* Main area skeleton */}
        <div className="flex-1 flex flex-col gap-4 p-6">
          <div className="flex-1 flex flex-col items-center justify-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-gray-800" />
            <div className="w-48 h-6 rounded bg-gray-800" />
            <div className="w-72 h-4 rounded bg-gray-800" />
          </div>
          <div className="h-14 rounded-xl bg-gray-800 w-full max-w-3xl mx-auto" />
        </div>
      </div>
    </div>
  );
}
