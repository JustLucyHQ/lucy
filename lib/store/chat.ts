'use client';

import { create } from 'zustand';

export interface ToolChip {
  slug: string;
  tool: string;
  ok?: boolean;   // undefined = pending, true = success, false = failed
}

interface ChatState {
  selectedModel: string;
  selectedProvider: string;
  isLoading: boolean;
  isStreaming: boolean;
  streamingContent: string;
  error: string | null;
  toolChips: ToolChip[];
  setSelectedModel: (model: string) => void;
  setSelectedProvider: (provider: string) => void;
  setLoading: (loading: boolean) => void;
  setStreaming: (streaming: boolean) => void;
  appendStreamingContent: (chunk: string) => void;
  clearStreamingContent: () => void;
  setError: (error: string | null) => void;
  addToolChip: (chip: ToolChip) => void;
  updateToolChip: (slug: string, tool: string, ok: boolean) => void;
  clearToolChips: () => void;
}

export const useChatStore = create<ChatState>()((set) => ({
  selectedModel: 'gpt-4o',
  selectedProvider: 'openai',
  isLoading: false,
  isStreaming: false,
  streamingContent: '',
  error: null,
  toolChips: [],

  setSelectedModel: (model) => set({ selectedModel: model }),
  setSelectedProvider: (provider) => set({ selectedProvider: provider }),
  setLoading: (isLoading) => set({ isLoading }),
  setStreaming: (isStreaming) => set({ isStreaming }),
  appendStreamingContent: (chunk) =>
    set((state) => ({ streamingContent: state.streamingContent + chunk })),
  clearStreamingContent: () => set({ streamingContent: '' }),
  setError: (error) => set({ error }),
  addToolChip: (chip) =>
    set((state) => ({ toolChips: [...state.toolChips, chip] })),
  updateToolChip: (slug, tool, ok) =>
    set((state) => ({
      toolChips: state.toolChips.map((c) =>
        c.slug === slug && c.tool === tool ? { ...c, ok } : c
      ),
    })),
  clearToolChips: () => set({ toolChips: [] }),
}));
