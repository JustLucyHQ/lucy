'use client';

import React from 'react';
import { User } from 'lucide-react';
import { LucyMark } from '@/components/brand/LucyMark';

type AvatarRole = 'user' | 'assistant';

interface AvatarProps {
  role: AvatarRole;
  size?: 'sm' | 'md';
  className?: string;
}

export function Avatar({ role, size = 'md', className = '' }: AvatarProps) {
  const sizeClass = size === 'sm' ? 'w-7 h-7' : 'w-8 h-8';
  const iconSize = size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4';

  if (role === 'assistant') {
    return <LucyMark className={`${sizeClass} rounded-lg shrink-0 ${className}`} />;
  }

  return (
    <div
      className={`
        ${sizeClass} rounded-full flex items-center justify-center shrink-0
        bg-raised
        ${className}
      `}
    >
      <User className={`${iconSize} text-t2`} />
    </div>
  );
}
