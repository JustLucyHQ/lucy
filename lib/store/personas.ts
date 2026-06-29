'use client';

/**
 * Personas zustand store.
 *
 * Manages AI personas (system prompts) that configure the assistant's
 * personality, expertise, and behavior. Persisted to localStorage.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Persona {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  icon: string;
  model?: string;
  temperature?: number;
  isDefault?: boolean;
  createdAt: number;
}

interface PersonasState {
  personas: Persona[];
  activePersonaId: string | null;

  // CRUD
  addPersona(persona: Omit<Persona, 'id' | 'createdAt'>): string;
  updatePersona(id: string, updates: Partial<Omit<Persona, 'id' | 'createdAt'>>): void;
  deletePersona(id: string): void;
  getPersona(id: string): Persona | null;

  // Active selection
  setActivePersona(id: string | null): void;
  getActivePersona(): Persona | null;
}

// ─── Built-in personas ────────────────────────────────────────────────────────

const BUILT_IN_PERSONAS: Persona[] = [
  {
    id: 'builtin-general',
    name: 'General Assistant',
    description: 'Helpful, balanced assistant for everyday tasks',
    systemPrompt:
      'You are Lucy, a helpful and balanced AI assistant. You provide clear, accurate, and thoughtful responses to a wide variety of questions and tasks. You are friendly, concise when brevity is appropriate, and thorough when depth is needed.',
    icon: '🤖',
    isDefault: true,
    createdAt: 0,
  },
  {
    id: 'builtin-code',
    name: 'Code Expert',
    description: 'Senior developer — writes clean, production-ready TypeScript',
    systemPrompt:
      'You are an expert software engineer with 15+ years of experience. You specialise in TypeScript, React, Node.js, and modern web development. When writing code: prefer TypeScript with proper types, follow SOLID principles, write clean and self-documenting code, add brief comments for non-obvious logic, and always consider edge cases and error handling. When reviewing code, point out issues with severity levels.',
    icon: '💻',
    createdAt: 0,
  },
  {
    id: 'builtin-writer',
    name: 'Creative Writer',
    description: 'Storytelling, copywriting, and creative content',
    systemPrompt:
      'You are a talented creative writer and content strategist. You excel at storytelling, brand copywriting, persuasive writing, and creative content creation. You adapt your tone and style to match the audience and purpose — whether that\'s punchy marketing copy, engaging blog posts, compelling narratives, or thoughtful scripts. Always ask about the target audience and desired tone if not specified.',
    icon: '✍️',
    createdAt: 0,
  },
  {
    id: 'builtin-analyst',
    name: 'Data Analyst',
    description: 'SQL, data analysis, charts, and statistics',
    systemPrompt:
      'You are a skilled data analyst with expertise in SQL, Python (pandas, numpy, matplotlib), statistical analysis, and data visualisation. When asked about data problems: suggest appropriate analysis approaches, write efficient SQL queries, recommend the right chart types for the data, explain statistical concepts clearly, and flag potential data quality issues. Present findings in a structured, actionable way.',
    icon: '📊',
    createdAt: 0,
  },
  {
    id: 'builtin-onboarding',
    name: 'Onboarding Guide',
    description: 'Helps new employees learn company tools and processes',
    systemPrompt:
      'You are a friendly and patient onboarding specialist. Your role is to help new employees get up to speed with company tools, processes, and culture. You break down complex topics into digestible steps, provide encouragement, anticipate common questions, and always point people to the right resources. You are patient with repetitive questions and never make people feel bad for asking basics.',
    icon: '🎓',
    createdAt: 0,
  },
];

// ─── Store ────────────────────────────────────────────────────────────────────

export const usePersonasStore = create<PersonasState>()(
  persist(
    (set, get) => ({
      personas: BUILT_IN_PERSONAS,
      activePersonaId: 'builtin-general',

      addPersona(personaData) {
        const id = `persona-${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        const persona: Persona = {
          ...personaData,
          id,
          createdAt: Date.now(),
        };
        set((state) => ({ personas: [...state.personas, persona] }));
        return id;
      },

      updatePersona(id, updates) {
        set((state) => ({
          personas: state.personas.map((p) =>
            p.id === id ? { ...p, ...updates } : p
          ),
        }));
      },

      deletePersona(id) {
        // Cannot delete built-in personas
        if (id.startsWith('builtin-')) return;
        set((state) => {
          const remaining = state.personas.filter((p) => p.id !== id);
          return {
            personas: remaining,
            // Fall back to default if active persona was deleted
            activePersonaId:
              state.activePersonaId === id ? 'builtin-general' : state.activePersonaId,
          };
        });
      },

      getPersona(id) {
        return get().personas.find((p) => p.id === id) ?? null;
      },

      setActivePersona(id) {
        set({ activePersonaId: id });
      },

      getActivePersona() {
        const { personas, activePersonaId } = get();
        return personas.find((p) => p.id === activePersonaId) ?? null;
      },
    }),
    {
      name: 'lucy-personas',
      // Only persist custom personas and active selection; built-ins are always re-seeded
      partialize: (state: PersonasState) => ({
        // Persist only non-built-in personas plus active id
        personas: state.personas.filter((p: Persona) => !p.id.startsWith('builtin-')),
        activePersonaId: state.activePersonaId,
      }),
      // On rehydrate, merge stored custom personas with the built-in ones
      merge: (persisted, current) => {
        const stored = persisted as Partial<PersonasState>;
        const customPersonas = (stored.personas ?? []).filter(
          (p: Persona) => !p.id.startsWith('builtin-')
        );
        return {
          ...current,
          personas: [...BUILT_IN_PERSONAS, ...customPersonas],
          activePersonaId: stored.activePersonaId ?? 'builtin-general',
        };
      },
    }
  )
);
