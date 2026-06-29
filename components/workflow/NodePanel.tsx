'use client';

/**
 * NodePanel — left sidebar showing draggable node type cards.
 *
 * Uses React Flow's drag-and-drop pattern: set data on dragstart,
 * the WorkflowCanvas reads it on drop.
 */

import React from 'react';
import {
  Play, Sparkles, GitBranch, BookOpen, MessageSquare, Wand2, Globe,
} from 'lucide-react';
import { getAllNodeDefs, NODE_GROUPS } from '@/lib/workflow/registry';
import type { NodeType } from '@/lib/workflow/types';

const ICON_MAP: Record<string, React.ElementType> = {
  Play, Sparkles, GitBranch, BookOpen, MessageSquare, Wand2, Globe,
};

export function NodePanel() {
  const allDefs = getAllNodeDefs();

  const onDragStart = (event: React.DragEvent, nodeType: NodeType) => {
    event.dataTransfer.setData('application/lucy-workflow-node', nodeType);
    event.dataTransfer.effectAllowed = 'move';
  };

  return (
    <aside className="w-56 bg-gray-900 border-r border-gray-800 flex flex-col overflow-y-auto">
      <div className="px-3 py-3 border-b border-gray-800">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Nodes</h2>
        <p className="text-xs text-gray-600 mt-0.5">Drag onto canvas</p>
      </div>

      <div className="flex-1 p-2 space-y-4">
        {NODE_GROUPS.map((group) => {
          const groupDefs = allDefs.filter((d) => d.group === group.id);
          if (groupDefs.length === 0) return null;
          return (
            <div key={group.id}>
              <p className="text-xs text-gray-500 font-medium uppercase tracking-wider px-1 mb-1.5">
                {group.label}
              </p>
              <div className="space-y-1">
                {groupDefs.map((def) => {
                  const Icon = ICON_MAP[def.iconName] ?? Play;
                  return (
                    <div
                      key={def.type}
                      draggable
                      onDragStart={(e) => onDragStart(e, def.type)}
                      className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg border border-gray-700 bg-gray-800/50 cursor-grab hover:border-gray-500 hover:bg-gray-800 active:cursor-grabbing transition-all duration-100 select-none"
                    >
                      <div className={`w-7 h-7 rounded-md ${def.color} flex items-center justify-center shrink-0`}>
                        <Icon className="w-3.5 h-3.5 text-white" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-gray-200 truncate">{def.label}</p>
                        <p className="text-xs text-gray-500 truncate leading-tight">{def.description.slice(0, 40)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
