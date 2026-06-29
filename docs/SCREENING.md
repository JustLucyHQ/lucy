# Lucy Screening — Architecture & API Reference

## Overview

Lucy provides AI-powered contractor screening for Contractors Room (CR). Two modes:

1. **Profile Verification** (automatic, free) — Lucy reviews a contractor's profile data for completeness, consistency, and credibility. Awards a "Lucy Verified" badge.
2. **Project Screening** (client-initiated) — Lucy generates tailored interview questions, the contractor answers, and Lucy grades them on a 1-5 scale. Results are visible only to the client.

## Schema

All tables live in the `lucy` schema (not `public`). Key tables:

| Table | Purpose |
|-------|---------|
| `screenings` | Core screening records with grade, summary, strengths, concerns, transcript |
| `screening_answers` | Individual Q&A records linked to a screening |

The Supabase client is configured with `db: { schema: 'lucy' }`.

### Docker Setup

Add `lucy` to `PGRST_DB_SCHEMAS` in your docker-compose.yml:

```yaml
PGRST_DB_SCHEMAS: contractors_room,lucy
```

Then apply the migration:

```bash
docker exec -i supabase-db psql -U supabase_admin -d postgres < lib/supabase/schema.sql
```

## Grading Scale

| Grade | Label | Meaning |
|-------|-------|---------|
| 5 | Excellent Match | Highly qualified, strong relevant experience |
| 4 | Good Fit | Well qualified with relevant skills |
| 3 | Potential Fit | Some relevant experience, may need support |
| 2 | Weak Fit | Limited relevant experience or concerns |
| 1 | Not Recommended | Significant gaps or red flags |

## Screening Flow

### Profile Verification

```
CR → POST /api/screening/start (type: profile_verification)
  └→ Lucy generates assessment via LLM
  └→ Status: pending → grading → completed
CR ← GET /api/screening/{id} (poll for results)
  └→ If grade >= 3: mark company as lucy_verified in CR
```

### Project Screening

```
CR → POST /api/screening/start (type: project_screening)
  └→ Lucy generates questions via LLM
  └→ Status: pending → generating_questions → awaiting_answers
CR ← GET /api/screening/{id} (get questions)
  └→ Show questions to contractor

Contractor answers →
CR → POST /api/screening/{id} (submit answers)
  └→ Lucy grades via LLM
  └→ Status: awaiting_answers → grading → completed
CR ← GET /api/screening/{id} (get grade + results)
```

## API Routes

### `POST /api/screening/start`

Start a new screening.

```json
{
  "screening_type": "project_screening",
  "contractor_company_id": 5,
  "client_company_id": 2,
  "project_id": 10,
  "project_brief": "React Native mobile app...",
  "custom_questions": ["How do you handle testing?"],
  "contractor_profile": {
    "company_id": 5,
    "display_name": "Jane Smith",
    "skills": ["React Native", "TypeScript"],
    "qualifications": ["BSc Computer Science"],
    "description": "Senior mobile developer..."
  },
  "provider": "openai",
  "model": "gpt-4o"
}
```

Response: `201 { screening_id, status, screening_type }`

### `GET /api/screening/{id}`

Get screening status and results.

Response includes `questions` when `awaiting_answers`, and `grade/summary/strengths/concerns` when `completed`.

### `POST /api/screening/{id}`

Submit answers (when status is `awaiting_answers`).

```json
{
  "answers": [
    { "question_id": "q1", "answer": "I have 5 years of React Native..." },
    { "question_id": "q2", "answer": "I use Jest and Detox..." }
  ]
}
```

### `GET /api/screening`

List screenings with filters: `?project_id=10&status=completed`

## Authentication

All screening API routes require a valid Lucy API key. Keys are per-user, stored as SHA-256 hashes in `lucy.api_keys`.

### Key Format

`lucy_k_<24-random-base64url-chars>` (e.g. `lucy_k_8AgXcZBucOrB...`)

### How It Works

1. External app sends `Authorization: Bearer lucy_k_...`
2. Lucy hashes the key and looks it up in `lucy.api_keys`
3. If found and active, the request proceeds (associated with the key's `user_id`)
4. `last_used_at` is updated on each successful validation

### Generating a Key

**Via the Settings page:** Login to Lucy → Settings → API Keys → Create Key

**Via CLI (for seeding):**
```bash
cd C:\RepositoryAI\LucyAI
npx tsx lib/scripts/seed-admin-key.ts
```

### Key Management API

- `POST /api/keys` — create key (Supabase session auth)
- `GET /api/keys` — list keys (prefix only, never full key)
- `DELETE /api/keys?id=<uuid>&action=revoke` — deactivate
- `DELETE /api/keys?id=<uuid>&action=delete` — permanent remove

### Multi-Tenancy

Each API key maps to a `user_id`. Screenings created via that key have `created_by = user_id`. RLS ensures users can only see their own screenings via direct DB access. Service-role (used by API routes) bypasses RLS.

## MCP Server

Lucy exposes screening tools via MCP (Model Context Protocol).

### Tools

| Tool | Description |
|------|-------------|
| `start_screening` | Start a profile verification or project screening |
| `get_screening` | Get status and results by ID |
| `list_screenings` | List screenings with filters |
| `submit_screening_answers` | Submit contractor answers |
| `verify_contractor_profile` | One-shot profile verification |

### Configuration

Add to your MCP client config (e.g. Claude Code `settings.json`):

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

Run standalone: `npm run mcp`

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Service role key for DB access |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Fallback | Used if service role key not set |
| `LUCY_API_KEY` | No | API key for auth (open in dev) |
| `LUCY_URL` | No | Lucy URL for MCP→HTTP callbacks (default: http://localhost:3001) |
| `OPENAI_API_KEY` | For OpenAI | LLM provider key |
| `ANTHROPIC_API_KEY` | For Anthropic | LLM provider key |
| `GOOGLE_API_KEY` | For Google | LLM provider key |

## File Map

| File | Purpose |
|------|---------|
| `lib/supabase/schema.sql` | Full schema including screening tables |
| `lib/supabase/api_keys.sql` | API keys table migration |
| `lib/supabase/screening_rls_fix.sql` | Multi-tenancy RLS fix |
| `lib/screening/types.ts` | TypeScript types and grade labels |
| `lib/screening/grading.ts` | LLM prompt builders and response parsers |
| `lib/screening/index.ts` | Core screening service (start, submit, grade, list) |
| `lib/auth/api-keys.ts` | API key generation, hashing, validation, CRUD |
| `app/api/screening/start/route.ts` | Start screening API (API key auth) |
| `app/api/screening/[id]/route.ts` | Get/submit answers API (API key auth) |
| `app/api/screening/route.ts` | List screenings API (API key auth) |
| `app/api/keys/route.ts` | API key management (Supabase session auth) |
| `lib/mcp/server.ts` | MCP server exposing screening tools |
| `lib/scripts/seed-admin-key.ts` | CLI to seed admin API key |
