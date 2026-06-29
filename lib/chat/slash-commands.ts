export type SlashCommandKind =
  | 'remember'
  | 'forget'
  | 'global'
  | 'memories'
  | 'incognito'
  | 'new'
  | 'help';

export interface SlashCommand {
  name: string; // 'remember'
  label: string; // '/remember'
  description: string;
  /** When present, the command takes a text argument (and the hint is shown). */
  argHint?: string;
  kind: SlashCommandKind;
}

export const SLASH_COMMANDS: SlashCommand[] = [
  { name: 'remember', label: '/remember', description: 'Save a fact to memory', argHint: 'what to remember', kind: 'remember' },
  { name: 'forget', label: '/forget', description: 'Forget memories matching the text', argHint: 'what to forget', kind: 'forget' },
  { name: 'global', label: '/global', description: 'Save shared knowledge for everyone', argHint: 'what to share', kind: 'global' },
  { name: 'memories', label: '/memories', description: 'Show what Lucy remembers', kind: 'memories' },
  { name: 'incognito', label: '/incognito', description: "Toggle: don't capture memories this session", kind: 'incognito' },
  { name: 'new', label: '/new', description: 'Start a new conversation', kind: 'new' },
  { name: 'help', label: '/help', description: 'List available commands', kind: 'help' },
];

/**
 * Autocomplete source: returns matching commands only while the input is a bare
 * command token (a slash followed by word characters, no space yet). Empty once
 * the user types a space (i.e. starts entering an argument) or for normal text.
 */
export function getCommandSuggestions(text: string): SlashCommand[] {
  const m = text.match(/^\/(\w*)$/);
  if (!m) return [];
  const partial = m[1].toLowerCase();
  return SLASH_COMMANDS.filter((c) => c.name.startsWith(partial));
}

export interface ParsedCommand {
  kind: SlashCommandKind;
  /** The trimmed argument for arg-commands; undefined for no-arg commands. */
  text?: string;
}

/**
 * Execution parser. Returns null for normal messages, unknown commands, and
 * arg-commands typed without a body (so they fall through as a normal message).
 */
export function parseSlashCommand(input: string): ParsedCommand | null {
  const m = input.trim().match(/^\/(\w+)(?:\s+([\s\S]+))?$/);
  if (!m) return null;
  const cmd = SLASH_COMMANDS.find((c) => c.name === m[1].toLowerCase());
  if (!cmd) return null;
  const arg = m[2]?.trim();
  if (cmd.argHint) {
    if (!arg) return null; // arg-command needs a body
    return { kind: cmd.kind, text: arg };
  }
  return { kind: cmd.kind }; // no-arg command ignores trailing text
}
