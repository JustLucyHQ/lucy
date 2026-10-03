'use client';
// Ticks off the password rule as the person types (lib/auth/password-policy.ts — same rule as Bizinly).
import { Check, Circle } from 'lucide-react';
import { checkPassword, PASSWORD_RULES } from '@/lib/auth/password-policy';

export function PasswordChecklist({ password, className = '' }: { password: string; className?: string }) {
  const { failed } = checkPassword(password);
  return (
    <ul className={`grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 ${className}`} aria-label="Password rules">
      {PASSWORD_RULES.map((r) => {
        const met = password.length > 0 && !failed.includes(r.key);
        return (
          <li key={r.key} className={`flex items-center gap-1.5 text-xs ${met ? 'text-green-400' : 'text-t3'}`}>
            {met ? <Check className="w-3.5 h-3.5" /> : <Circle className="w-3 h-3" />}
            {r.label}
          </li>
        );
      })}
    </ul>
  );
}
