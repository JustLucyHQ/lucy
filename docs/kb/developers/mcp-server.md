# MCP server

Lucy ships an MCP **server** that exposes her contractor-screening tools over **stdio**, so any MCP-compatible host — Claude Desktop, Claude Code, Cursor, or another editor — can start screenings, poll results, and submit answers as tool calls.

This is the **server** direction. Lucy is also an MCP **client** — the [connector marketplace](/docs/connectors), where Lucy consumes *other* servers' tools. The two are independent.

## Tools exposed

| Tool | Description |
|---|---|
| `start_screening` | Start a screening — `profile_verification` or `project_screening`. Returns a `screening_id` to poll. |
| `get_screening` | Fetch a screening's status and (when ready) questions or grade by `screening_id`. |
| `list_screenings` | List screenings, newest first (max 50), with optional filters. |
| `submit_screening_answers` | Submit a contractor's answers — only when the screening is in `awaiting_answers`. |

There is no separate "verify profile" tool: a profile verification is just `start_screening` with `screening_type: "profile_verification"`.

### Tool parameters

**`start_screening`**

| Param | Type | Notes |
|---|---|---|
| `screening_type` | `"profile_verification"` \| `"project_screening"` | Required |
| `contractor_company_id` | number | Required — Contractors Room company ID |
| `client_company_id` | number | Required |
| `project_id` | number | Required for `project_screening` |
| `project_brief` | string | Optional context for question generation |
| `contractor_name`, `contractor_description` | string | Optional profile fields |
| `contractor_skills`, `contractor_qualifications` | string[] | Optional profile fields |
| `custom_questions` | string[] | Optional client-supplied questions |
| `provider` | `"openai"` \| `"anthropic"` \| `"google"` | Optional — defaults to `openai` |
| `model` | string | Optional — defaults to `gpt-4o` |

**`get_screening`** / **`submit_screening_answers`** take `screening_id` (a UUID). `submit_screening_answers` also takes `answers` — an array of `{ question_id, answer }`. **`list_screenings`** takes optional `project_id`, `contractor_company_id`, `client_company_id`, and `status`.

## Running

```bash
npm run mcp     # runs lib/mcp/server.ts over stdio
```

The script is `npx tsx lib/mcp/server.ts`, so it runs straight from the repo with no build step. Most hosts launch the server for you using the config below rather than you running it by hand.

## Claude Desktop / Cursor / Claude Code configuration

```json
{
  "mcpServers": {
    "lucy": {
      "command": "npx",
      "args": ["tsx", "lib/mcp/server.ts"],
      "cwd": "C:\\RepositoryAI\\LucyAI",
      "env": {
        "NEXT_PUBLIC_SUPABASE_URL": "http://localhost:8000",
        "SUPABASE_SERVICE_ROLE_KEY": "your-service-role-key",
        "OPENAI_API_KEY": "your-key"
      }
    }
  }
}
```

Set `cwd` to your LucyAI checkout so the relative `args` path resolves. The server talks **directly to Supabase** with the service-role key (schema `lucy`) — it does not go through Lucy's HTTP API for reads or writes, so it has no per-key user auth of its own. After creating or updating a screening it fires a non-blocking call to Lucy's HTTP API (`LUCY_URL`, default `http://localhost:3001`) to kick off question generation and grading.

### Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase URL (`SUPABASE_INTERNAL_URL` takes precedence if set) |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | DB access (falls back to `NEXT_PUBLIC_SUPABASE_ANON_KEY`) |
| `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `GOOGLE_API_KEY` | Per provider | LLM key for the chosen `provider` |
| `LUCY_URL` | Optional | Lucy instance for the async processing callback (default `http://localhost:3001`) |

## Screening lifecycle

A screening moves through these statuses; poll `get_screening` to follow along:

`pending → generating_questions → awaiting_answers → grading → completed` (or `failed`).

- **`profile_verification`** skips questions — it goes `pending → grading → completed`.
- **`awaiting_answers`** is when `get_screening` returns the `questions`; submit them with `submit_screening_answers`.
- **`completed`** is when `get_screening` returns `grade` (1–5), `grade_label`, `summary`, `strengths`, and `concerns`.

## Example: project screening end to end

```
start_screening { screening_type: "project_screening",
                  contractor_company_id: 5, client_company_id: 2, project_id: 10,
                  project_brief: "React Native mobile app",
                  contractor_skills: ["React Native", "TypeScript"] }
  → { screening_id: "…", status: "pending" }

get_screening { screening_id: "…" }        # poll until status: "awaiting_answers"
  → { status: "awaiting_answers", questions: [{ id: "q1", … }, …] }

submit_screening_answers { screening_id: "…",
                           answers: [{ question_id: "q1", answer: "…" }] }
  → { status: "grading" }

get_screening { screening_id: "…" }        # poll until status: "completed"
  → { status: "completed", grade: 4, grade_label: "Good Fit", summary, strengths, concerns }
```

## Both directions

The same MCP standard powers the [connector marketplace](/docs/connectors) — Lucy consuming other servers' tools. Anything you build as an MCP server can become a Lucy connector by adding a catalog entry (`lib/mcp/catalog.ts`).
