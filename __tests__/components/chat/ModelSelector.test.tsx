/**
 * Tests for components/chat/ModelSelector.tsx
 *
 * Covers: renders model groups for OpenAI/Anthropic/Google, onChange fires
 * with correct model id.
 *
 * The component makes a fetch call for local model detection; we mock that
 * so it resolves immediately with no local models.
 */

import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ModelSelector } from '@/components/chat/ModelSelector';

// ── Mock providers so tests don't need SDKs ──────────────────────────────────

jest.mock('@/lib/providers', () => ({
  getModelsByProvider: jest.fn(() => ({
    openai: [
      { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai' },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini', provider: 'openai' },
    ],
    anthropic: [
      { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', provider: 'anthropic' },
    ],
    google: [
      { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', provider: 'google' },
    ],
    local: [],
  })),
  getModelById: jest.fn((id: string) => {
    const all: Record<string, { id: string; name: string; provider: string }> = {
      'gpt-4o': { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai' },
      'gpt-4o-mini': { id: 'gpt-4o-mini', name: 'GPT-4o Mini', provider: 'openai' },
      'claude-sonnet-4-6': { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', provider: 'anthropic' },
      'gemini-2.0-flash': { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', provider: 'google' },
    };
    return all[id] ?? undefined;
  }),
  setLocalModels: jest.fn(),
}));

// ── Mock fetch — resolve immediately with no local models ────────────────────

beforeAll(() => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      byProvider: { local: [] },
      localStatus: {
        ollama: { available: false },
        lmstudio: { available: false },
      },
    }),
  } as Response);
});

afterAll(() => {
  jest.restoreAllMocks();
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('ModelSelector', () => {
  const defaultProps = {
    selectedModel: 'gpt-4o',
    onModelChange: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        byProvider: { local: [] },
        localStatus: {
          ollama: { available: false },
          lmstudio: { available: false },
        },
      }),
    });
  });

  it('renders a select element', async () => {
    await act(async () => { render(<ModelSelector {...defaultProps} />); });
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  it('renders the OpenAI model group with its models', async () => {
    await act(async () => { render(<ModelSelector {...defaultProps} />); });
    expect(screen.getByText('GPT-4o')).toBeInTheDocument();
    expect(screen.getByText('GPT-4o Mini')).toBeInTheDocument();
  });

  it('renders the Anthropic model group with its models', async () => {
    await act(async () => { render(<ModelSelector {...defaultProps} />); });
    expect(screen.getByText('Claude Sonnet 4.6')).toBeInTheDocument();
  });

  it('renders the Google model group with its models', async () => {
    await act(async () => { render(<ModelSelector {...defaultProps} />); });
    expect(screen.getByText('Gemini 2.0 Flash')).toBeInTheDocument();
  });

  it('greys out (disables) secondary providers but keeps Claude/ChatGPT selectable', async () => {
    await act(async () => { render(<ModelSelector {...defaultProps} />); });
    // Google is a secondary provider — its group is disabled (greyed, unselectable)
    expect(screen.getByText('Gemini 2.0 Flash').closest('optgroup')).toBeDisabled();
    // Primary providers stay enabled
    expect(screen.getByText('GPT-4o').closest('optgroup')).not.toBeDisabled();
    expect(screen.getByText('Claude Sonnet 4.6').closest('optgroup')).not.toBeDisabled();
  });

  it('has the selectedModel value pre-selected', async () => {
    await act(async () => { render(<ModelSelector selectedModel="gpt-4o-mini" onModelChange={jest.fn()} />); });
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    expect(select.value).toBe('gpt-4o-mini');
  });

  it('calls onModelChange with the correct model id when changed', async () => {
    const onModelChange = jest.fn();
    await act(async () => { render(<ModelSelector selectedModel="gpt-4o" onModelChange={onModelChange} />); });

    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'gpt-4o-mini' } });

    expect(onModelChange).toHaveBeenCalledWith('gpt-4o-mini', 'openai');
  });

  it('calls onModelChange with anthropic provider when an Anthropic model is selected', async () => {
    const onModelChange = jest.fn();
    await act(async () => { render(<ModelSelector selectedModel="gpt-4o" onModelChange={onModelChange} />); });

    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'claude-sonnet-4-6' } });

    expect(onModelChange).toHaveBeenCalledWith('claude-sonnet-4-6', 'anthropic');
  });
});
