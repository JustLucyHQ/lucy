import { roleOf, isEnvAdmin, LUCY_ROLE_KEY } from '@/lib/auth/admin';

describe('roleOf', () => {
  it('reads the namespaced admin flag from app_metadata', () => {
    expect(roleOf({ id: '1', app_metadata: { [LUCY_ROLE_KEY]: 'admin' } })).toBe('admin');
    expect(roleOf({ id: '1', app_metadata: { [LUCY_ROLE_KEY]: 'member' } })).toBe('member');
    expect(roleOf({ id: '1', app_metadata: {} })).toBe('member');
    expect(roleOf({ id: '1' })).toBe('member');
    expect(roleOf(null)).toBe('member');
  });

  it('ignores roles set by other apps sharing the auth instance', () => {
    expect(roleOf({ id: '1', app_metadata: { role: 'admin' } })).toBe('member');
  });
});

describe('isEnvAdmin', () => {
  it('matches against a comma-separated list, case-insensitive', () => {
    const list = 'admin@bizinly.com, admin@contractorsroom.com';
    expect(isEnvAdmin('ADMIN@bizinly.com', list)).toBe(true);
    expect(isEnvAdmin('admin@contractorsroom.com', list)).toBe(true);
    expect(isEnvAdmin('nope@x.com', list)).toBe(false);
  });

  it('is false when the env list is unset or the email is missing', () => {
    expect(isEnvAdmin('anyone@x.com', undefined)).toBe(false);
    expect(isEnvAdmin('anyone@x.com', '')).toBe(false);
    expect(isEnvAdmin(null, 'admin@x.com')).toBe(false);
    expect(isEnvAdmin(undefined, 'admin@x.com')).toBe(false);
  });
});
