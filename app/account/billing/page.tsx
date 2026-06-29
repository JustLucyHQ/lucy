'use client';
import { CreditCard, Sparkles } from 'lucide-react';
import { useConversationsStore } from '@/lib/store/conversations';

export default function BillingPage() {
  const conversations = useConversationsStore((s) => s.conversations);
  const messageCount = conversations.reduce((n, c) => n + c.messages.length, 0);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-t1 tracking-tight">Billing</h2>
        <p className="text-sm text-t3 mt-0.5">Plan, usage, and subscription.</p>
      </div>

      {/* Current plan */}
      <div className="rounded-theme border border-edge bg-surface p-5 space-y-2">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-accent-soft" />
          <span className="text-sm font-semibold text-t1">Free</span>
          <span className="text-[10px] font-bold uppercase tracking-wide text-accent-soft bg-accent/15 rounded-full px-2 py-0.5">
            Current plan
          </span>
        </div>
        <p className="text-xs text-t2">
          All features included while Lucy is self-hosted. You bring your own provider API keys.
        </p>
      </div>

      {/* Usage */}
      <div className="rounded-theme border border-edge bg-surface p-5 space-y-3">
        <h3 className="text-sm font-medium text-t1">Usage</h3>
        <div className="grid grid-cols-2 gap-4 max-w-sm">
          <div>
            <div className="text-xl font-bold text-t1">{conversations.length}</div>
            <div className="text-xs text-t3">Conversations</div>
          </div>
          <div>
            <div className="text-xl font-bold text-t1">{messageCount.toLocaleString()}</div>
            <div className="text-xs text-t3">Messages</div>
          </div>
        </div>
      </div>

      {/* Future */}
      <div className="rounded-theme border border-edge bg-surface p-5 space-y-2 opacity-70">
        <div className="flex items-center gap-2">
          <CreditCard className="w-4 h-4 text-t3" />
          <h3 className="text-sm font-medium text-t1">Subscription</h3>
        </div>
        <p className="text-xs text-t3">
          Payment and team plans are not enabled on this deployment yet.
        </p>
        <button disabled className="text-xs px-3 py-1.5 rounded-theme border border-edge text-t3 cursor-not-allowed">
          Manage subscription
        </button>
      </div>
    </div>
  );
}
