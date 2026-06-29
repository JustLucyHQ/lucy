# HTTP API

Lucy's routes live under `/api`. Most are JSON in / JSON out; chat streams Server-Sent Events. This page covers the public, server-to-server surface.

## Authentication

Routes accept one or both of:

1. **Session cookie** — the `@supabase/ssr` cookies a logged-in browser carries on same-origin fetches (also works for a shared-auth app on the same Supabase project).
2. **Lucy API key** — `Authorization: Bearer lucy_k_...` for server-to-server. Create keys in **Settings → API Access**; only a SHA-256 hash is stored, the full key is shown once, and the prefix (`lucy_k_…`, 12 chars) is kept for display. Keys map to a user and can be revoked or deleted any time.

Auth is always derived server-side — the request body's user id is never trusted. Which methods a route accepts:

| Auth accepted | Routes |
|---|---|
| **Session or API key** | `/api/chat`, `/api/memory/*`, `/api/workflows/*` (except the webhook), `/api/provider-keys` |
| **API key only** | `/api/screening/*` |
| **Session only** | `/api/keys` |
| **Secret token** | `/api/workflows/triggers/:id/webhook` (per-trigger secret, no user auth) |
| **None** | `/api/models` |

Most routes run only when Supabase is configured (connected mode); without it, auth-gated routes return `401`/`503`.

## POST /api/chat — streaming chat

Rate limited (30 req/min/IP → `429` with `Retry-After`). Returns `text/event-stream`.

```bash
curl -N https://justlucy.ai/api/chat \
  -H "Content-Type: application/json" \
  -H "x-openai-key: sk-..." \
  -d '{"messages":[{"role":"user","content":"Hello"}],"model":"gpt-4o","provider":"openai"}'
```

```
data: {"content":"Hello"}
data: {"content":" there!"}
data: [DONE]
```

Body fields: `messages` (required), `model` (required), `provider` (required), and optional `projectId` and `systemPrompt`. Errors stream as `data: {"error":"..."}` followed by `data: [DONE]` (the connection stays 200).

**Provider keys** are resolved in order: request header → the caller's stored encrypted key (Lucy API key auth only) → server env fallback. Env fallbacks (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, …) are reserved for authenticated callers in connected mode so anonymous visitors can't spend the server's quota.

| Header | Provider |
|---|---|
| `x-openai-key` | OpenAI |
| `x-anthropic-key` | Anthropic |
| `x-google-key` | Google |
| `x-deepseek-key` | DeepSeek |
| `x-groq-key` | Groq |
| `x-mistral-key` | Mistral |
| `x-xai-key` | xAI |
| `x-openrouter-key` | OpenRouter |

`provider: "local"` needs no key — pass `x-ollama-url` / `x-lmstudio-url` to override the defaults. Send `x-memory-enabled: 1` to retrieve and inject the caller's memories (authenticated calls only); the count comes back as a metadata event.

Tool calls run server-side when the authenticated caller has connectors installed (OpenAI-compatible and Anthropic providers). They're emitted as metadata events — arguments are intentionally omitted:

```
data: {"metadata":{"memoryCount":3}}
data: {"metadata":{"tool_call":{"slug":"github","tool":"create_issue"}}}
data: {"metadata":{"tool_result":{"slug":"github","tool":"create_issue","ok":true}}}
```

## GET /api/models

No auth. Returns `{ models, byProvider }` — all cloud models grouped by provider. Add `?includeLocal=true` to probe Ollama/LM Studio and also get a `localStatus` report (per-server `available`, `url`, `modelCount`).

## Memory API (session or API key)

`userId` is derived from auth; cookie callers get an RLS-scoped client, API-key callers a service client scoped to the key's owner. Returns `401` when unauthenticated.

| Endpoint | Purpose |
|---|---|
| `POST /api/memory/search` | Semantic search. Body `{ query, limit?, projectId? }` (`limit` 1–25, default 5). Returns `{ results: [{ content, importance }], count }`. Rate limited 30/min/IP. |
| `GET /api/memory/list` | All of the caller's memories plus a `usage` summary. |
| `DELETE /api/memory/list?id=…` | Archive one memory (ownership is verified first). |
| `POST /api/memory/command` | Save a fact. Body `{ kind: "remember" \| "global", text, projectId?, conversationId? }`. |

```bash
curl https://justlucy.ai/api/memory/search \
  -H "Authorization: Bearer lucy_k_..." \
  -H "Content-Type: application/json" \
  -d '{"query":"deployment steps","limit":5}'
```

## Workflows API (session or API key)

Durable, server-side runs (connected mode). All run/trigger reads and writes are scoped to the caller; the webhook is the only unauthenticated entry and uses a per-trigger secret instead.

| Endpoint | Purpose |
|---|---|
| `POST /api/workflows/run` | Enqueue a manual run. Body `{ definition, inputs?, workflowId? }`; `definition.nodes` must include a Start node (≤500 nodes). Returns `{ runId }`. |
| `GET /api/workflows/runs?workflowId=&limit=` | List runs (status, timing, error). |
| `GET /api/workflows/runs/:runId` | One run with `inputs`, `outputs`, `logs`. |
| `POST /api/workflows/runs/:runId/cancel` | Cancel — `canceled` if queued, `canceling` if running. |
| `GET /api/workflows/triggers?workflowId=` | List triggers. |
| `POST /api/workflows/triggers` | Create a trigger (see below). |
| `PATCH /api/workflows/triggers/:id` | Toggle `enabled`, rename, or update `settings`/`definition`. |
| `DELETE /api/workflows/triggers/:id` | Remove a trigger. |
| `GET /api/workflows/:id/versions` | List published versions (newest first). |
| `POST /api/workflows/:id/versions` | Publish the current draft as the next numbered version. |

**Triggers** take `{ workflowId, type, settings, definition, inputs?, name? }`. `type` is one of:

| Type | `settings` | Fires when |
|---|---|---|
| `cron` | `{ expr, timezone? }` | The cron slot comes due (a slot can't fire twice). |
| `webhook` | — | The webhook URL is POSTed (a `secret` is generated on create). |
| `record_event` | `{ table, events }` | A watched row changes. `table` ∈ `conversations`, `memories`; `events` ⊆ `INSERT`, `UPDATE`, `DELETE`. |

### POST /api/workflows/triggers/:id/webhook

No user auth — authenticate with the trigger's secret via `?token=<secret>` or an `x-webhook-token` header. The JSON body is merged over the trigger's stored `inputs` and becomes the run inputs. Rate limited 60/min/IP; CORS-open.

```bash
curl -X POST "https://justlucy.ai/api/workflows/triggers/<id>/webhook?token=<secret>" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: abc123" \
  -d '{"ticket_text":"Customer cannot log in"}'
```

Send an `Idempotency-Key` header to make retries safe — a repeated key returns the existing `{ runId, deduped: true }` instead of enqueuing again. Trigger-initiated runs retry on failure with exponential backoff; manual runs don't.

## Screening API (Lucy API key required)

AI contractor screening for marketplace integrations. All reads are tenant-scoped to the API key's owner — other tenants' screenings 404.

| Endpoint | Purpose |
|---|---|
| `POST /api/screening/start` | Start a screening. Body needs `contractor_company_id`, `client_company_id`, `contractor_profile`; `screening_type` defaults to `project_screening`. Returns `{ screening_id, status, screening_type }`. |
| `GET /api/screening/:id` | Status + results. |
| `POST /api/screening/:id` | Submit answers. Body `{ answers: [{ question_id, answer }] }`; returns `{ status, grade, grade_label }`. |
| `GET /api/screening` | List, filterable by `project_id`, `contractor_company_id`, `client_company_id`, `status`. |

Screenings are graded 1–5 (Not Recommended → Excellent Match) with strengths and concerns.

## Key management

| Endpoint | Auth | Purpose |
|---|---|---|
| `POST /api/keys` | Session | Create a key; the full key is returned once. |
| `GET /api/keys` | Session | List your keys (prefix, name, status, timestamps — never the full key). |
| `DELETE /api/keys?id=…&action=revoke\|delete` | Session | Revoke (deactivate) or permanently delete. Defaults to `revoke`. |
| `GET/POST /api/provider-keys` | Session or API key | Read/store your provider keys (AES-256-GCM, server-side). |
