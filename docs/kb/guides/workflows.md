# Workflows

The workflow builder turns multi-step AI tasks into a visual pipeline. In
**connected mode** (signed into Lucy with Supabase configured) workflows run
**server-side and durably** — a run survives closing the tab, is saved with full
history, and can be triggered automatically. On the **desktop app** (local-first,
no account) workflows run in the browser as you watch.

## Building a workflow

1. Open **Workflows** → **New Workflow** (or start from a template).
2. Drag nodes from the left panel onto the canvas.
3. Connect them: output handle → input handle.
4. Select a node to configure it in the right panel.
5. **Save**, then **Run** — enter any inputs and the run streams per-node logs,
   timing, and the final output.

## How durable execution works (connected mode)

When you click **Run** (or a trigger fires), Lucy doesn't execute in your browser
— it **enqueues** the run as a row in `lucy.workflow_runs` with a snapshot of the
workflow definition. An in-process worker (started by the server, connected mode
only) polls every few seconds, **claims** the next due run with a Postgres
`SKIP LOCKED` lock so two workers never grab the same one, and executes it on the
server with your provider keys **decrypted server-side** (keys never reach the
browser during a run). Status (`queued → running → success / failed / canceled`)
and per-node logs are written back as it goes; the builder polls and the **Runs**
panel shows history. Because the run lives in the database, it **survives closing
the tab, a refresh, or a server restart**.

On the **desktop app** (standalone, no Supabase) there's no worker — workflows
run in the browser as you watch, without triggers, history, or retries.

## Node types

| Node | Purpose |
|---|---|
| Start | Entry point; defines input variables |
| AI Agent | Calls a model you pick (provider + model) with a prompt |
| Knowledge Base | Semantic recall from your memories |
| Condition | Branches the flow (if / else) on a comparison |
| Filter | Continues only if the input matches a condition; otherwise stops the branch |
| Transform | Reshapes text (template, uppercase, extract JSON, …) |
| Code | Runs a JavaScript snippet — `(input) => output` |
| HTTP | Calls an external API |
| Send Email | Sends an email via your SMTP settings (server/connected mode only) |
| Integration | Executes a registered app action |
| Output | Collects the final result |

## Variables

Use `{{variableName}}` anywhere in node configs. The Start node seeds variables;
each node's output flows to the nodes after it (use `{{input}}` for the previous
node's output).

```
Start (ticket_text)
  → AI Agent "Classify this ticket: {{ticket_text}}"
  → Condition (classification contains "urgent")
      → true:  Send Email to your on-call address
      → false: Output (queued)
```

## Triggers — run a workflow automatically (connected mode)

Open a workflow → **Triggers**. A trigger stores a **snapshot** of the workflow
definition, so editing the canvas doesn't change a live trigger until you re-save it.

**On a schedule (cron).** Pick a preset (hourly / daily / weekly) or write a cron
expression — `0 9 * * 1` is every Monday at 09:00. The worker enqueues a run when
the slot comes due, and the same slot can't fire twice.

**Webhook.** Copy the secret URL and POST to it — the JSON body becomes the run
inputs, so anything can kick a workflow:

```bash
curl -X POST "https://your-lucy/api/workflows/triggers/<id>/webhook?token=<secret>" \
  -H "Content-Type: application/json" \
  -d '{"ticket_text": "Customer cannot log in"}'
```

Send an `Idempotency-Key` header to make retries safe (a repeated key won't
double-fire); requests without the secret token are rejected.

**Record event.** Run when a row is **created / updated / deleted** in a watched
table (**Conversations** or **Memories**), scoped to your own records. A Postgres
`AFTER` trigger drops the change onto an event queue; the worker matches enabled
triggers and enqueues a run with the changed row as input, de-duplicated so each
event runs once.

## Runs & cancellation

**See Runs** shows run history with status, timing, and per-node logs. A queued or
running run can be **canceled** (queued cancels immediately; a running run stops at
the next node).

Failed **trigger-initiated** runs **retry automatically** with exponential backoff
— roughly 10s, 20s, 40s … capped at 5 minutes — for a few attempts before being
marked failed. Manual runs don't retry by default. Combined with the idempotency
keys on cron / webhook / record enqueues, a double-fire or re-processed event
won't create duplicate runs.

## Versions

**Versions** → **Publish current draft** snapshots the canvas as a numbered,
immutable version. The list lets you **restore** any past version back into the
editor. The canvas itself is always your working draft.

## Notes

- **AI Agent** nodes use the API keys from **Settings → Providers** (decrypted
  server-side in connected mode — keys never leave the server during a run).
- **Send Email** needs SMTP configured and only runs in connected mode.
- **Code** runs your own JavaScript synchronously — keep snippets simple (no long
  loops).
- Triggers, run history, cancellation, retry, and versions are **connected-mode**
  features (the desktop app runs workflows locally without them).
