/** @jest-environment node */
import { checkPassword } from '@/lib/auth/password-policy';

const auth = { userId: 'u1', email: 'ana@example.com', client: { auth: { signOut: jest.fn(async () => ({ error: null })) } } as any };
jest.mock('@/lib/memory/auth', () => ({ resolveMemoryAuth: jest.fn(async () => auth) }));

const signInWithPassword = jest.fn();
const updateUserById = jest.fn(async () => ({ error: null }));
let identities: { provider: string }[] = [{ provider: 'email' }];
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    auth: {
      signInWithPassword: (...a: unknown[]) => signInWithPassword(...a),
      signOut: jest.fn(async () => ({})),
      admin: {
        getUserById: jest.fn(async () => ({ data: { user: { identities } } })),
        updateUserById: (...a: unknown[]) => (updateUserById as any)(...a),
      },
    },
  })),
}));

import { POST } from '@/app/api/auth/password/route';

const GOOD = 'Correct-horse-9';
const req = (body: unknown) => new Request('http://x/api/auth/password', { method: 'POST', body: JSON.stringify(body) }) as any;

beforeAll(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://sb';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'svc';
});
beforeEach(() => { jest.clearAllMocks(); identities = [{ provider: 'email' }]; auth.userId = `u-${Math.random()}`; });

it('password rule: 12+ chars, digit, upper, lower, special (Unicode letters count)', () => {
  expect(checkPassword('short1A!').failed).toEqual(['length']);
  expect(checkPassword('alllowercase12!').failed).toEqual(['upper']);
  expect(checkPassword('NoDigitsHere!!').failed).toEqual(['digit']);
  expect(checkPassword('NoSpecial12345').failed).toEqual(['special']);
  expect(checkPassword('Čćđšž-ČĆĐŠŽ-1').ok).toBe(true);
  expect(checkPassword(GOOD).ok).toBe(true);
});

it('refuses a wrong current password and does not change anything', async () => {
  signInWithPassword.mockResolvedValueOnce({ error: { message: 'Invalid login credentials' } });
  const res = await POST(req({ current: 'nope', next: GOOD, confirm: GOOD }));
  expect(res.status).toBe(400);
  expect((await res.json()).errors.current).toMatch(/not your current password/);
  expect(updateUserById).not.toHaveBeenCalled();
});

it('refuses a weak new password before checking anything else', async () => {
  const res = await POST(req({ current: 'old', next: 'weakpassword', confirm: 'weakpassword' }));
  expect(res.status).toBe(400);
  expect(signInWithPassword).not.toHaveBeenCalled();
});

it('changes the password after the current one checks out, then signs out other devices', async () => {
  signInWithPassword.mockResolvedValueOnce({ error: null });
  const res = await POST(req({ current: 'Old-password-1', next: GOOD, confirm: GOOD }));
  expect((await res.json()).ok).toBe(true);
  expect(signInWithPassword).toHaveBeenCalledWith({ email: 'ana@example.com', password: 'Old-password-1' });
  expect(updateUserById).toHaveBeenCalledWith(auth.userId, { password: GOOD });
  expect(auth.client.auth.signOut).toHaveBeenCalledWith({ scope: 'others' });
});

it('a Google-only account is pointed to "Forgot password" instead', async () => {
  identities = [{ provider: 'google' }];
  const res = await POST(req({ current: 'x', next: GOOD, confirm: GOOD }));
  expect((await res.json()).error).toMatch(/Forgot password/);
  expect(updateUserById).not.toHaveBeenCalled();
});
