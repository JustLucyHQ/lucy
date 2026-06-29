'use client';

import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export function Input({
  label,
  error,
  hint,
  leftIcon,
  rightIcon,
  className = '',
  id,
  ...props
}: InputProps) {
  const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label
          htmlFor={inputId}
          className="text-[11px] font-bold uppercase tracking-[0.08em] text-t3"
        >
          {label}
        </label>
      )}
      <div className="relative">
        {leftIcon && (
          <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-t3">
            {leftIcon}
          </div>
        )}
        <input
          id={inputId}
          {...props}
          className={`
            w-full bg-bg border rounded-theme px-3.5 py-2.5 text-sm text-t1
            placeholder:text-t3/70 outline-none transition-all
            focus:border-accent-soft focus:ring-2 focus:ring-accent/20
            disabled:opacity-60 disabled:cursor-not-allowed
            read-only:text-t3 read-only:focus:border-edge read-only:focus:ring-0
            ${error ? 'border-red-500' : 'border-edge'}
            ${leftIcon ? 'pl-9' : ''}
            ${rightIcon ? 'pr-9' : ''}
            ${className}
          `}
        />
        {rightIcon && (
          <div className="absolute inset-y-0 right-0 flex items-center pr-3 text-t3">
            {rightIcon}
          </div>
        )}
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
      {hint && !error && <p className="text-xs text-t3">{hint}</p>}
    </div>
  );
}
