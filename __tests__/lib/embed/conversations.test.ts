// Regression test for MED-3: ensureConversation() must refuse to log into a
// conversation id that belongs to a DIFFERENT widget/owner. Previously it used
// upsert(..., { ignoreDuplicates: true }), which silently no-op'd on a collision —
// so a visitor-supplied conversationId reused from another tenant's widget would
// pass straight through, and the caller's addMessage() would inject the visitor's
// text into that other tenant's transcript.

const mockInsert = jest.fn();
const mockMaybeSingle = jest.fn();
const mockSelectEq = jest.fn().mockReturnValue({ maybeSingle: mockMaybeSingle });
const mockSelect = jest.fn().mockReturnValue({ eq: mockSelectEq });

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn().mockImplementation(() => ({
    from: jest.fn().mockReturnValue({
      insert: mockInsert,
      select: mockSelect,
    }),
  })),
}));

import { ensureConversation } from '@/lib/embed/conversations';

describe('ensureConversation — cross-tenant ownership binding', () => {
  const REAL_ENV = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...REAL_ENV, NEXT_PUBLIC_SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'svc' };
  });

  afterEach(() => {
    process.env = REAL_ENV;
  });

  it('returns true when the insert succeeds (brand-new conversation id)', async () => {
    mockInsert.mockResolvedValue({ error: null });
    const ok = await ensureConversation('conv-1', 'widget-a', 'owner-a');
    expect(ok).toBe(true);
    expect(mockInsert).toHaveBeenCalledWith({ id: 'conv-1', widget_id: 'widget-a', user_id: 'owner-a' });
  });

  it('returns true when the id already exists but belongs to this widget/owner', async () => {
    mockInsert.mockResolvedValue({ error: { code: '23505' } });
    mockMaybeSingle.mockResolvedValue({ data: { widget_id: 'widget-a', user_id: 'owner-a' } });
    const ok = await ensureConversation('conv-1', 'widget-a', 'owner-a');
    expect(ok).toBe(true);
  });

  it('returns false when the id belongs to a DIFFERENT widget (cross-tenant collision)', async () => {
    mockInsert.mockResolvedValue({ error: { code: '23505' } });
    mockMaybeSingle.mockResolvedValue({ data: { widget_id: 'widget-b', user_id: 'owner-b' } });
    const ok = await ensureConversation('conv-1', 'widget-a', 'owner-a');
    expect(ok).toBe(false);
  });

  it('returns false when the id belongs to a different OWNER even with the same widget id string', async () => {
    mockInsert.mockResolvedValue({ error: { code: '23505' } });
    mockMaybeSingle.mockResolvedValue({ data: { widget_id: 'widget-a', user_id: 'owner-b' } });
    const ok = await ensureConversation('conv-1', 'widget-a', 'owner-a');
    expect(ok).toBe(false);
  });
});
