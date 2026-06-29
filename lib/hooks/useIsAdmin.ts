'use client';
import { useEffect, useState } from 'react';

/** Fetches the admin flag once. Defaults to false until known. */
export function useIsAdmin(): boolean {
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    let cancelled = false;
    fetch('/api/admin/me')
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setIsAdmin(Boolean(d?.isAdmin)); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);
  return isAdmin;
}
