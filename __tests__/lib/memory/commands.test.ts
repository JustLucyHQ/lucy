import { parseMemoryCommand } from '@/lib/memory/commands';

describe('parseMemoryCommand', () => {
  it('parses /remember', () => {
    expect(parseMemoryCommand('/remember prod DB is read-only'))
      .toEqual({ kind: 'remember', text: 'prod DB is read-only' });
  });
  it('parses /global', () => {
    expect(parseMemoryCommand('/global office is closed Fridays'))
      .toEqual({ kind: 'global', text: 'office is closed Fridays' });
  });
  it('returns null for normal messages', () => {
    expect(parseMemoryCommand('what is the weather?')).toBeNull();
  });
  it('returns null for a command with no body', () => {
    expect(parseMemoryCommand('/remember   ')).toBeNull();
  });
});
