'use client';

import React from 'react';
import { RefreshCw } from 'lucide-react';
import { LucyMark } from '@/components/brand/LucyMark';

interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="flex justify-center">
          <LucyMark className="w-14 h-14 rounded-2xl" />
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-white">Something went wrong</h1>
          <p className="text-gray-400 text-sm">
            {error.message || 'An unexpected error occurred. Please try again.'}
          </p>
        </div>

        <button
          onClick={reset}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-lucy-600 hover:bg-lucy-500 text-white text-sm font-medium transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Try again
        </button>
      </div>
    </div>
  );
}
