import Link from 'next/link';

export default function Page() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950 p-4 text-center">
      <div className="max-w-sm space-y-3">
        <h1 className="text-lg font-semibold text-white">Account temporarily locked</h1>
        <p className="text-sm text-gray-400">Too many failed verification attempts. Please sign in again.</p>
        <Link href="/auth/login" className="inline-block bg-lucy-600 hover:bg-lucy-500 text-white rounded px-4 py-2 text-sm">Back to sign in</Link>
      </div>
    </div>
  );
}
