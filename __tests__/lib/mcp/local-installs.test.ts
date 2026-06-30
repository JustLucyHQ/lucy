import {
  filterLocalCatalog,
  getLocalInstalls,
  installLocal,
  uninstallLocal,
  patchLocal,
} from '@/lib/mcp/local-installs';

beforeEach(() => localStorage.clear());

describe('filterLocalCatalog', () => {
  it('returns installable connectors (no built-ins, no OAuth-only)', () => {
    const all = filterLocalCatalog();
    expect(all.length).toBeGreaterThan(0);
    expect(all.every((s) => !s.built_in)).toBe(true);
    expect(all.every((s) => s.meta?.authMethod !== 'oauth_remote_mcp' && s.meta?.authMethod !== 'oauth_app')).toBe(true);
  });

  it('filters by category', () => {
    const dev = filterLocalCatalog('dev');
    expect(dev.length).toBeGreaterThan(0);
    expect(dev.every((s) => s.category === 'dev')).toBe(true);
  });

  it('filters by query against name + description', () => {
    const all = filterLocalCatalog();
    const sample = all[0].name.slice(0, 3).toLowerCase();
    const hits = filterLocalCatalog(undefined, sample);
    expect(hits.every((s) => `${s.name} ${s.description}`.toLowerCase().includes(sample))).toBe(true);
  });
});

describe('local install store (localStorage)', () => {
  it('installs, lists, patches, re-configures, and uninstalls', () => {
    expect(getLocalInstalls()).toEqual([]);

    installLocal('demo-slug', { apiKey: 'aaa' });
    let rows = getLocalInstalls();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ server_slug: 'demo-slug', enabled: true, require_approval: false });

    patchLocal('demo-slug', { enabled: false, require_approval: true });
    rows = getLocalInstalls();
    expect(rows[0].enabled).toBe(false);
    expect(rows[0].require_approval).toBe(true);

    installLocal('demo-slug', { apiKey: 'bbb' }); // re-config merges, keeps flags
    rows = getLocalInstalls();
    expect(rows).toHaveLength(1);
    expect(rows[0].config).toMatchObject({ apiKey: 'bbb' });
    expect(rows[0].enabled).toBe(false);

    uninstallLocal('demo-slug');
    expect(getLocalInstalls()).toEqual([]);
  });
});
