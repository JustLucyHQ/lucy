import React from 'react';
import Link from 'next/link';
import { LucyMark } from '@/components/brand/LucyMark';

export default function NotFoundPage() {
  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="flex justify-center">
          <LucyMark className="w-14 h-14 rounded-2xl" />
        </div>

        <div className="space-y-2">
          <p className="text-lucy-400 text-sm font-semibold tracking-widest uppercase">404</p>
          <h1 className="text-2xl font-bold text-white">Page not found</h1>
          <p className="text-gray-400 text-sm">
            The page you&apos;re looking for doesn&apos;t exist or has been moved.
          </p>
        </div>

        <Link
          href="/chat"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-lucy-600 hover:bg-lucy-500 text-white text-sm font-medium transition-colors"
        >
          Back to Chat
        </Link>
      </div>
    </div>
  );
}
