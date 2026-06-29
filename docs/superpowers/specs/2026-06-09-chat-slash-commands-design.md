# Chat Slash-Commands — Design Spec

**Status:** Approved (design) · **Date:** 2026-06-09 · **Owner:** Johnny

## Goal

Make Lucy's chat commands discoverable and easy to use via an autocomplete menu in
the chat input, and round out the set beyond the existing `/remember` and `/global`.

## Command set (7)

| Command | Arg | Effect |
|---|---|---|
| `/remember <text>` | yes | Save a private fact to memory (`source=user_remember`). |
| `/forget <text>` | yes | Archive memories whose content/summary matches the text. |
| `/global <text>` | yes | Save shared knowledge (`visibility=global`). |
| `/memories` | no | Show a system note: count + a few recent memory summaries. |
| `/incognito` | no | Toggle `useMemoryStore.incognito` (skip capture this session). |
| `/new` | no | Start a new conversation. |
| `/help` | no | System note listing all commands. |

## Architecture

**`lib/chat/slash-commands.ts` (new) — single source of truth**
- `SlashCommand` type: `{ name, label, description, argHint?, kind }`.
- `SLASH_COMMANDS: SlashCommand[]` — the 7 entries above.
- `getCommandSuggestions(text): SlashCommand[]` — returns matches when `text` is a
  bare command token (`/^\/(\w*)$/`, i.e. a slash + partial name, no space yet);
  used to drive the autocomplete menu. Empty array otherwise.
- `parseSlashCommand(input): { kind, text? } | null` — execution parser. `kind` is
  one of the 7; `text` is the trimmed argument for arg-commands (null/absent for
  no-arg). Returns null for normal messages and for arg-commands with no body.

**`components/chat/ChatInput.tsx` — autocomplete menu**
- A dropdown rendered **above** the textarea, shown while `getCommandSuggestions(value)`
  is non-empty.
- State: `suggestions: SlashCommand[]`, `highlight: number` (index).
- Keyboard (in `handleKeyDown`, only when the menu is open):
  - `ArrowDown`/`ArrowUp` move `highlight` (wrap-around).
  - `Enter` or `Tab` apply the highlighted command (do NOT send).
  - `Escape` close the menu.
- When the menu is **closed**, `Enter` sends as today.
- Apply behavior:
  - arg-command → set value to `"/name "` (trailing space), keep focus, close menu.
  - no-arg command → `onSend("/name")` immediately, clear input, close menu.
- Mouse: click a row to apply. Menu also closes on blur (with a small delay so a
  click registers) and when the value stops matching a bare command token.
- Accessibility: `role="listbox"` on the menu, `role="option"` + `aria-selected` on rows.

**`app/chat/page.tsx` `handleSend` — execution**
Replace the current `parseMemoryCommand` interception with `parseSlashCommand`, and
handle all 7 kinds. Create/ensure the conversation, append the user message, then:
- `remember` / `global` → existing memory write (connected: `/api/memory/command`;
  local: `ingestCommand` on the local store). Confirmation note as today.
- `forget` → connected: `POST /api/memory/forget { text }`; local: search the local
  store + archive matches. Note: "🗑️ Forgot N memory/memories matching ‘…’.".
- `memories` → connected: `GET /api/memory/list` (auth) → count + recent; local:
  local store `listAll`/`usage`. Note: "🧠 I remember N things. Recent: a · b · c".
- `incognito` → toggle `useMemoryStore`; note: "🕶️ Incognito on — new memories won't
  be captured this session." / "Incognito off — capturing again.".
- `new` → start a new conversation (existing new-chat handler) and return.
- `help` → note listing the 7 commands.

**`app/api/memory/forget/route.ts` (new)**
- `POST { text }`. `resolveMemoryAuth` (session/API-key; never trust body userId).
- Build a `SupabaseMemoryStore` with the RLS-scoped client; `listAll(scope)`, filter
  to rows whose `content`/`summary` contains `text` (case-insensitive), `archive(id)`
  each (RLS/ownership already enforced). Return `{ ok, forgotten: n }`.

**"Use gemma" (local chat model)**
Verification, not new code: the local server already exposes `gemma3:4b` at
`/v1/models`, so Lucy's `discoverLocalModels` surfaces it. Confirm it's selectable in
the model dropdown (Settings → Detect Models / the selector probe) and usable as the
chat model. Optionally set it as the default model for local-first testing.

## Testing
- Unit tests (`__tests__/lib/chat/slash-commands.test.ts`): `getCommandSuggestions`
  (matches partials, hides after a space, no match for plain text) and
  `parseSlashCommand` (all 7 kinds, arg trimming, null for empty arg / normal text).
- UI: `npx tsc --noEmit`, `npm run lint`, `npm run build`, manual smoke on gemma3:4b.

## Out of scope
Utility commands like `/model`, `/persona`, `/clear`, `/export`, `/title` (selectors /
menus already exist for these). Can be added later via the same registry.
