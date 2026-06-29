'use client';

import React, { useState, useRef, useCallback } from 'react';
import { Plus, MessageSquare, Trash2, Pencil, Check, Search, X } from 'lucide-react';
import { useConversationsStore } from '@/lib/store/conversations';
import { useStorage } from '@/lib/storage/provider';
import { Button } from '@/components/ui/Button';

interface ChatSidebarProps {
  onNewChat: () => void;
  onSelectConversation: (id: string) => void;
  /** Called when the user confirms deletion; the parent handles adapter access. */
  onDeleteConversation: (id: string) => Promise<void>;
  /** Whether this sidebar is shown as a mobile overlay (adds backdrop) */
  mobileOverlay?: boolean;
  /** Called when the mobile overlay should close */
  onMobileClose?: () => void;
}

function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  return date.toLocaleDateString();
}

export function ChatSidebar({
  onNewChat,
  onSelectConversation,
  onDeleteConversation,
  mobileOverlay = false,
  onMobileClose,
}: ChatSidebarProps) {
  const { conversations, activeConversationId, updateConversation } = useConversationsStore();
  const adapter = useStorage();
  const [search, setSearch] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);

  // ── Swipe-to-close on mobile ──────────────────────────────────────────────
  const touchStartX = useRef<number | null>(null);
  const SWIPE_THRESHOLD = 60; // px

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  }, []);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (touchStartX.current === null) return;
      const dx = touchStartX.current - e.changedTouches[0].clientX;
      touchStartX.current = null;
      // Swipe left to close
      if (dx > SWIPE_THRESHOLD && mobileOverlay && onMobileClose) {
        onMobileClose();
      }
    },
    [mobileOverlay, onMobileClose]
  );
  // ─────────────────────────────────────────────────────────────────────────

  const filtered = conversations.filter((c) =>
    c.title.toLowerCase().includes(search.toLowerCase())
  );

  // Group by date
  const groups: Record<string, typeof conversations> = {};
  for (const conv of filtered) {
    const label = formatDate(conv.updatedAt);
    if (!groups[label]) groups[label] = [];
    groups[label].push(conv);
  }

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setDeletingId(id);
    try {
      await onDeleteConversation(id);
    } finally {
      setDeletingId(null);
    }
  };

  const startRename = (e: React.MouseEvent, conv: { id: string; title: string }) => {
    e.stopPropagation();
    setRenamingId(conv.id);
    setRenameValue(conv.title);
    setTimeout(() => renameInputRef.current?.select(), 0);
  };

  const commitRename = async () => {
    if (!renamingId || !renameValue.trim()) {
      setRenamingId(null);
      return;
    }
    await updateConversation(renamingId, { title: renameValue.trim() }, adapter);
    setRenamingId(null);
  };

  const sidebar = (
    <nav
      role="navigation"
      aria-label="Conversation history"
      className="flex flex-col h-full bg-surface border-r border-edge"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Header */}
      <div className="p-3 border-b border-edge flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          icon={<Plus className="w-4 h-4" />}
          onClick={onNewChat}
          className="flex-1 justify-start text-gray-300 hover:text-white"
        >
          New chat
        </Button>
        {/* Close button for mobile overlay */}
        {mobileOverlay && (
          <button
            onClick={onMobileClose}
            className="p-1.5 rounded-md text-t3 hover:text-t2 hover:bg-raised transition-colors shrink-0"
            aria-label="Close sidebar"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Search */}
      {conversations.length > 3 && (
        <div className="px-3 py-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-t3" />
            <input
              type="text"
              placeholder="Search conversations..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search conversations"
              className="
                w-full bg-raised border border-edge-strong rounded-md
                pl-8 pr-7 py-1.5 text-xs text-t2 placeholder-t3
                focus:outline-none focus:border-edge
              "
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-t3 hover:text-t2"
                aria-label="Clear search"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Conversations list */}
      <div className="flex-1 overflow-y-auto py-2">
        {Object.keys(groups).length === 0 && (
          <div className="px-3 py-8 text-center text-xs text-t3">
            {search ? 'No conversations found' : 'No conversations yet'}
          </div>
        )}

        {Object.entries(groups).map(([label, convs]) => (
          <div key={label} className="mb-2">
            <div className="px-3 py-1 text-xs font-medium text-t3 uppercase tracking-wider">
              {label}
            </div>
            {convs.map((conv) => {
              const isActive = activeConversationId === conv.id;
              return (
                <div
                  key={conv.id}
                  role="button"
                  tabIndex={0}
                  aria-current={isActive ? 'true' : undefined}
                  onClick={() => {
                    onSelectConversation(conv.id);
                    // Close mobile overlay after selecting
                    if (mobileOverlay) onMobileClose?.();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSelectConversation(conv.id);
                      if (mobileOverlay) onMobileClose?.();
                    }
                  }}
                  className={`
                    w-full flex items-center gap-2 px-3 py-2 text-left
                    text-sm rounded-md mx-1 group cursor-pointer
                    transition-colors
                    ${
                      isActive
                        ? 'bg-raised text-t1'
                        : 'text-t3 hover:bg-raised/50 hover:text-t2'
                    }
                    ${deletingId === conv.id ? 'opacity-50' : ''}
                  `}
                >
                  <MessageSquare className="w-3.5 h-3.5 shrink-0 opacity-60" />
                  {renamingId === conv.id ? (
                    <input
                      ref={renameInputRef}
                      className="flex-1 text-xs bg-raised border border-edge-strong rounded px-1 py-0.5 text-t1 focus:outline-none focus:border-lucy-500 min-w-0"
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onBlur={commitRename}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitRename();
                        if (e.key === 'Escape') setRenamingId(null);
                      }}
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <span className="flex-1 truncate text-xs">{conv.title}</span>
                  )}
                  {renamingId === conv.id ? (
                    <button
                      onClick={(e) => { e.stopPropagation(); commitRename(); }}
                      className="p-0.5 rounded text-green-400 hover:text-green-300 transition-all"
                      title="Save"
                      aria-label="Save conversation name"
                    >
                      <Check className="w-3 h-3" />
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={(e) => startRename(e, conv)}
                        className="
                          opacity-0 group-hover:opacity-100 p-0.5 rounded
                          hover:text-lucy-400 transition-all
                        "
                        title="Rename conversation"
                        aria-label={`Rename conversation: ${conv.title}`}
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                      <button
                        onClick={(e) => handleDelete(e, conv.id)}
                        className="
                          opacity-0 group-hover:opacity-100 p-0.5 rounded
                          hover:text-red-400 transition-all
                        "
                        title="Delete conversation"
                        aria-label={`Delete conversation: ${conv.title}`}
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </nav>
  );

  // Mobile overlay mode: render backdrop + slide-in panel
  if (mobileOverlay) {
    return (
      <>
        {/* Backdrop — click to close */}
        <div
          className="fixed inset-0 z-30 bg-black/60 md:hidden"
          onClick={onMobileClose}
          aria-hidden="true"
        />
        {/* Sidebar panel */}
        <div className="fixed top-14 left-0 bottom-0 z-40 w-72 md:hidden">
          {sidebar}
        </div>
      </>
    );
  }

  return sidebar;
}
