import {
  SLASH_COMMANDS,
  getCommandSuggestions,
  parseSlashCommand,
} from '@/lib/chat/slash-commands';

describe('getCommandSuggestions', () => {
  it('returns all commands for a bare slash', () => {
    expect(getCommandSuggestions('/')).toHaveLength(SLASH_COMMANDS.length);
  });
  it('filters by partial name', () => {
    expect(getCommandSuggestions('/re').map((c) => c.name)).toEqual(['remember']);
    expect(getCommandSuggestions('/g').map((c) => c.name)).toEqual(['global']);
  });
  it('returns nothing once a space is typed (entering the argument)', () => {
    expect(getCommandSuggestions('/remember foo')).toEqual([]);
  });
  it('returns nothing for normal text', () => {
    expect(getCommandSuggestions('hello there')).toEqual([]);
  });
  it('returns nothing for an unknown partial', () => {
    expect(getCommandSuggestions('/zzz')).toEqual([]);
  });
});

describe('parseSlashCommand', () => {
  it('parses arg-commands with their text', () => {
    expect(parseSlashCommand('/remember prod DB is read-only')).toEqual({
      kind: 'remember',
      text: 'prod DB is read-only',
    });
    expect(parseSlashCommand('/forget acme')).toEqual({ kind: 'forget', text: 'acme' });
    expect(parseSlashCommand('/global office closed Fridays')).toEqual({
      kind: 'global',
      text: 'office closed Fridays',
    });
  });
  it('parses no-arg commands', () => {
    expect(parseSlashCommand('/incognito')).toEqual({ kind: 'incognito' });
    expect(parseSlashCommand('/memories')).toEqual({ kind: 'memories' });
    expect(parseSlashCommand('/new')).toEqual({ kind: 'new' });
    expect(parseSlashCommand('/help')).toEqual({ kind: 'help' });
  });
  it('ignores trailing text on no-arg commands', () => {
    expect(parseSlashCommand('/help me please')).toEqual({ kind: 'help' });
  });
  it('returns null for an arg-command with no body', () => {
    expect(parseSlashCommand('/remember')).toBeNull();
    expect(parseSlashCommand('/remember   ')).toBeNull();
  });
  it('returns null for normal messages and unknown commands', () => {
    expect(parseSlashCommand('what is the weather?')).toBeNull();
    expect(parseSlashCommand('/unknown thing')).toBeNull();
  });
});
