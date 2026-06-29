import React from 'react';

/**
 * Skeleton loader for the Workflows page.
 */
export default function WorkflowsLoading() {
  return (
    <div className="flex flex-col h-screen bg-gray-950 animate-pulse">
      {/* Header skeleton */}
      <div className="h-14 border-b border-gray-800 bg-gray-900 flex items-center px-4 gap-3 shrink-0">
        <div className="w-7 h-7 rounded-lg bg-gray-700" />
        <div className="w-16 h-4 rounded bg-gray-700" />
      </div>

      <main className="flex-1 flex flex-col gap-6 p-8 max-w-5xl mx-auto w-full">
        <div className="flex items-center justify-between">
          <div className="w-40 h-7 rounded bg-gray-800" />
          <div className="w-32 h-9 rounded-lg bg-gray-800" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-40 rounded-xl bg-gray-800/60" />
          ))}
        </div>
      </main>
    </div>
  );
}
