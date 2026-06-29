'use client';

/**
 * /personas — full page to manage AI personas.
 *
 * Shows cards for each persona with name, icon, description, and system
 * prompt preview. Supports create, inline edit, and delete.
 */

import React, { useState } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { usePersonasStore, type Persona } from '@/lib/store/personas';
import {
  Plus,
  Pencil,
  Trash2,
  Check,
  X,
  Sparkles,
  Lock,
} from 'lucide-react';

// ─── Inline editor ────────────────────────────────────────────────────────────

interface PersonaEditorProps {
  persona?: Partial<Persona>;
  onSave: (data: Omit<Persona, 'id' | 'createdAt'>) => void;
  onCancel: () => void;
}

function PersonaEditor({ persona, onSave, onCancel }: PersonaEditorProps) {
  const [name, setName] = useState(persona?.name ?? '');
  const [icon, setIcon] = useState(persona?.icon ?? '🤖');
  const [description, setDescription] = useState(persona?.description ?? '');
  const [systemPrompt, setSystemPrompt] = useState(persona?.systemPrompt ?? '');

  const isValid = name.trim() && systemPrompt.trim();

  const handleSave = () => {
    if (!isValid) return;
    onSave({
      name: name.trim(),
      icon: icon || '🤖',
      description: description.trim(),
      systemPrompt: systemPrompt.trim(),
    });
  };

  return (
    <div className="space-y-4 p-4 bg-gray-800/50 border border-gray-700 rounded-xl">
      <div className="grid grid-cols-[auto_1fr] gap-3">
        {/* Emoji picker (simple text input) */}
        <div>
          <label className="text-xs text-gray-400 block mb-1">Icon</label>
          <input
            type="text"
            value={icon}
            onChange={(e) => setIcon(e.target.value.slice(0, 2))}
            className="
              w-14 h-10 text-center text-2xl bg-gray-800 border border-gray-700 rounded-lg
              focus:outline-none focus:border-lucy-500
            "
            placeholder="🤖"
          />
        </div>
        <Input
          label="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Marketing Copywriter"
        />
      </div>

      <Input
        label="Short Description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="One-line summary shown in the selector"
      />

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-gray-300">System Prompt</label>
        <textarea
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          rows={6}
          placeholder="Describe how Lucy should behave with this persona..."
          className="
            w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2
            text-sm text-gray-100 placeholder-gray-500 resize-y
            focus:outline-none focus:border-lucy-500 focus:ring-1 focus:ring-lucy-500
          "
        />
        <p className="text-xs text-gray-600">
          {systemPrompt.length} characters — this is sent to the AI at the start of every conversation.
        </p>
      </div>

      <div className="flex items-center gap-2 justify-end">
        <Button variant="ghost" size="sm" onClick={onCancel} icon={<X className="w-4 h-4" />}>
          Cancel
        </Button>
        <Button
          size="sm"
          onClick={handleSave}
          disabled={!isValid}
          icon={<Check className="w-4 h-4" />}
        >
          Save Persona
        </Button>
      </div>
    </div>
  );
}

// ─── Persona card ─────────────────────────────────────────────────────────────

interface PersonaCardProps {
  persona: Persona;
  isActive: boolean;
  onEdit: (persona: Persona) => void;
  onDelete: (id: string) => void;
  onSelect: (id: string) => void;
}

function PersonaCard({ persona, isActive, onEdit, onDelete, onSelect }: PersonaCardProps) {
  const isBuiltIn = persona.id.startsWith('builtin-');
  const [expanded, setExpanded] = useState(false);

  return (
    <Card className={`group transition-all ${isActive ? 'border-lucy-600' : ''}`}>
      <div className="flex items-start gap-3">
        {/* Icon */}
        <button
          onClick={() => onSelect(persona.id)}
          className="text-3xl mt-0.5 shrink-0 hover:scale-110 transition-transform"
          title={`Use ${persona.name}`}
        >
          {persona.icon}
        </button>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold text-white">{persona.name}</h3>
            {isActive && (
              <Badge variant="purple">Active</Badge>
            )}
            {isBuiltIn && (
              <span className="inline-flex items-center gap-1 text-xs text-gray-600">
                <Lock className="w-3 h-3" /> Built-in
              </span>
            )}
          </div>
          <p className="text-xs text-gray-400 mt-0.5">{persona.description}</p>

          {/* System prompt preview */}
          <div className="mt-2">
            <button
              onClick={() => setExpanded((v) => !v)}
              className="text-xs text-gray-600 hover:text-gray-400 transition-colors"
            >
              {expanded ? 'Hide' : 'Show'} system prompt
            </button>
            {expanded && (
              <pre className="
                mt-2 p-3 bg-gray-900 border border-gray-800 rounded-lg
                text-xs text-gray-400 whitespace-pre-wrap font-mono leading-relaxed
                max-h-48 overflow-y-auto
              ">
                {persona.systemPrompt}
              </pre>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => onSelect(persona.id)}
            className="p-1.5 rounded-md text-gray-500 hover:text-lucy-400 hover:bg-gray-700 transition-colors"
            title="Use this persona"
          >
            <Check className="w-3.5 h-3.5" />
          </button>
          {!isBuiltIn && (
            <>
              <button
                onClick={() => onEdit(persona)}
                className="p-1.5 rounded-md text-gray-500 hover:text-gray-200 hover:bg-gray-700 transition-colors"
                title="Edit persona"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => onDelete(persona.id)}
                className="p-1.5 rounded-md text-gray-500 hover:text-red-400 hover:bg-gray-700 transition-colors"
                title="Delete persona"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </>
          )}
        </div>
      </div>
    </Card>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PersonasPage() {
  const { personas, activePersonaId, addPersona, updatePersona, deletePersona, setActivePersona } =
    usePersonasStore();
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const handleCreate = (data: Omit<Persona, 'id' | 'createdAt'>) => {
    addPersona(data);
    setCreating(false);
  };

  const handleUpdate = (data: Omit<Persona, 'id' | 'createdAt'>) => {
    if (!editingId) return;
    updatePersona(editingId, data);
    setEditingId(null);
  };

  const handleDelete = (id: string) => {
    if (confirm('Delete this persona?')) {
      deletePersona(id);
    }
  };

  const editingPersona = editingId ? personas.find((p) => p.id === editingId) : null;

  return (
    <AppShell title="Personas">
        <div className="max-w-3xl mx-auto px-4 py-8">
          {/* Page header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Sparkles className="w-5 h-5 text-lucy-400" />
                <h1 className="text-2xl font-bold text-white">Personas</h1>
              </div>
              <p className="text-sm text-gray-400">
                Personas define how Lucy behaves. Pick one before starting a chat.
              </p>
            </div>
            <Button
              size="sm"
              onClick={() => { setCreating(true); setEditingId(null); }}
              icon={<Plus className="w-4 h-4" />}
              disabled={creating}
            >
              Create Custom
            </Button>
          </div>

          {/* Create form */}
          {creating && (
            <div className="mb-6">
              <PersonaEditor
                onSave={handleCreate}
                onCancel={() => setCreating(false)}
              />
            </div>
          )}

          {/* Persona cards */}
          <div className="space-y-3">
            {personas.map((persona) => {
              if (editingId === persona.id) {
                return (
                  <div key={persona.id}>
                    <PersonaEditor
                      persona={persona}
                      onSave={handleUpdate}
                      onCancel={() => setEditingId(null)}
                    />
                  </div>
                );
              }
              return (
                <PersonaCard
                  key={persona.id}
                  persona={persona}
                  isActive={persona.id === activePersonaId}
                  onEdit={(p) => { setEditingId(p.id); setCreating(false); }}
                  onDelete={handleDelete}
                  onSelect={(id) => setActivePersona(id)}
                />
              );
            })}
          </div>

          {personas.length === 0 && (
            <div className="text-center py-16 text-gray-600">
              <Sparkles className="w-8 h-8 mx-auto mb-3 opacity-30" />
              <p>No personas yet. Create one to get started.</p>
            </div>
          )}
        </div>
    </AppShell>
  );
}
