import { useMemoryStore } from '@/lib/store/memory';

describe('useMemoryStore', () => {
  beforeEach(() => useMemoryStore.setState({ enabled: false, incognito: false }));

  it('defaults to disabled, not incognito', () => {
    const s = useMemoryStore.getState();
    expect(s.enabled).toBe(false);
    expect(s.incognito).toBe(false);
  });

  it('toggles incognito', () => {
    useMemoryStore.getState().setIncognito(true);
    expect(useMemoryStore.getState().incognito).toBe(true);
  });

  it('reports header value when enabled', () => {
    useMemoryStore.setState({ enabled: true });
    expect(useMemoryStore.getState().memoryHeader()).toBe('1');
    useMemoryStore.setState({ enabled: false });
    expect(useMemoryStore.getState().memoryHeader()).toBe('0');
  });
});
