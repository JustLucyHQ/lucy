'use client';

/**
 * PersonaSelector — dropdown/modal to pick an AI persona.
 *
 * Shown as a chip/badge near the chat input. Clicking opens a
 * dropdown listing all personas with icon, name, and description.
 * Includes a "Create Custom" button.
 */

import React, { useRef, useEffect, useState } from 'react';
import { ChevronDown, Plus, Check, Sparkles } from 'lucide-react';
import { usePersonasStore, type Persona } from '@/lib/store/personas';
import { useRouter } from 'next/navigation';

interface PersonaSelectorProps {
  className?: string;
}

export function PersonaSelector({ className = '' }: PersonaSelectorProps) {
  const { personas, activePersonaId, setActivePersona, getActivePersona } = usePersonasStore();
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const activePersona = getActivePersona();

  // Close on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) {
      document.addEventListener('mousedown', handleClick);
      return () => document.removeEventListener('mousedown', handleClick);
    }
  }, [open]);

  const handleSelect = (persona: Persona) => {
    setActivePersona(persona.id);
    setOpen(false);
  };

  const handleCreateCustom = () => {
    setOpen(false);
    router.push('/personas');
  };

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      {/* Trigger chip */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="
          flex items-center gap-1.5 px-2 py-1 rounded-full
          bg-raised/60 hover:bg-raised border border-edge-strong hover:border-edge
          text-xs text-t2 hover:text-t1
          transition-colors
        "
        aria-label={`Active persona: ${activePersona?.name ?? 'None'}`}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className="text-base leading-none">{activePersona?.icon ?? '🤖'}</span>
        <span className="hidden sm:inline max-w-[80px] truncate font-medium">
          {activePersona?.name ?? 'Persona'}
        </span>
        <ChevronDown className="w-3 h-3 opacity-60 shrink-0" />
      </button>

      {/* Dropdown */}
      {open && (
        <div
          className="
            absolute bottom-full mb-2 left-0
            w-72 bg-surface border border-edge-strong rounded-theme shadow-2xl
            z-50 overflow-hidden
          "
          role="listbox"
          aria-label="Select persona"
        >
          <div className="px-3 py-2 border-b border-edge">
            <div className="flex items-center gap-1.5 text-xs text-t3">
              <Sparkles className="w-3.5 h-3.5 text-lucy-400" />
              <span>Select Persona</span>
            </div>
          </div>

          <div className="max-h-64 overflow-y-auto py-1">
            {personas.map((persona) => {
              const isActive = persona.id === activePersonaId;
              return (
                <button
                  key={persona.id}
                  role="option"
                  aria-selected={isActive}
                  onClick={() => handleSelect(persona)}
                  className={`
                    w-full flex items-start gap-3 px-3 py-2.5 text-left
                    transition-colors hover:bg-raised/70
                    ${isActive ? 'bg-raised' : ''}
                  `}
                >
                  <span className="text-xl mt-0.5 shrink-0">{persona.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-medium text-t2 truncate">
                        {persona.name}
                      </span>
                      {isActive && (
                        <Check className="w-3.5 h-3.5 text-lucy-400 shrink-0" />
                      )}
                    </div>
                    <p className="text-xs text-t3 truncate mt-0.5">
                      {persona.description}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="border-t border-edge p-2">
            <button
              onClick={handleCreateCustom}
              className="
                w-full flex items-center gap-2 px-3 py-2 rounded-theme
                text-xs text-lucy-400 hover:text-lucy-300 hover:bg-raised/70
                transition-colors
              "
            >
              <Plus className="w-3.5 h-3.5" />
              Create Custom Persona
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
