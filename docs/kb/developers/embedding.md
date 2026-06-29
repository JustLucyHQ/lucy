# Embedding Lucy

Lucy drops into any project you own — three doors, increasing depth.

## 1. The one-line widget

```html
<script src="https://lucy.your-company.com/api/embed?project=your-app" async></script>
```

That's the whole integration: a floating Lucy chat bubble appears in your app. The loader is served by `GET /api/embed`. It injects a `<div id="lucy-widget-root">` and an **iframe** pointing at Lucy's `/embed` page — so Lucy runs in its own document and never collides with your app's React, styles, or globals. It also sets `window.__LUCY_ORIGIN__` so chat requests go back to your Lucy deployment.

Query params (all optional):

| Param | Values | Default |
|---|---|---|
| `project` | A registered integration id — gives Lucy your business context | _(none)_ |
| `model` | Default model id, e.g. `gpt-4o` | `gpt-4o` |
| `position` | `bottom-right`, `bottom-left`, `inline` | `bottom-right` |
| `theme` | `dark`, `light`, `auto` | `dark` |

Inputs are sanitised server-side; unknown `position`/`theme` values fall back to the defaults. The loader is cached for 5 minutes and sent with `Access-Control-Allow-Origin: *`, so the one script tag works from any origin.

The injected iframe is a fixed **340×520** panel in the chosen bottom corner (`position` only chooses the corner here — `bottom-left` snaps it left, anything else right). `inline` is a layout mode for the React component below, not the floating loader.

### Import the React component directly

In a Next.js app that shares Lucy's source you can skip the loader and render the widget yourself:

```tsx
import { LucyWidget } from '@/components/embed/LucyWidget';

<LucyWidget projectId="your-app" position="inline" theme="dark" height="520px" />
```

| Prop | Type | Default | Notes |
|---|---|---|---|
| `projectId` | `string` | — | Registered integration id |
| `position` | `'bottom-right' \| 'bottom-left' \| 'inline'` | `bottom-right` | `inline` renders flat (no bubble) |
| `theme` | `'dark' \| 'light' \| 'auto'` | `dark` | |
| `defaultModel` | `string` | `gpt-4o` | |
| `height` | `string` | `480px` | CSS length, e.g. `520px` or `100vh` |
| `onAction` | `(action, params) => void` | — | Fires when Lucy proposes a host-app action |

The `/embed` page (what the loader's iframe loads) renders a full-height `<LucyWidget position="inline" height="100vh" />`, passing the `project`, `theme`, and `model` URL params straight through to the component.

## 2. Shared authentication

If your app and Lucy share the same Supabase project, your users are already signed in to Lucy — the widget and the full app pick up the session cookie. One auth, your whole stack.

## 3. Business context (integration registry)

Register your app's schema and actions so Lucy answers with live data. Call `registerProject` once at startup (the way the built-in `contractors-room` integration does):

```ts
import { registerProject } from '@/lib/integrations/registry';

registerProject({
  id: 'your-app',
  name: 'Your App',
  description: 'What this app is for — used in the AI context',
  supabaseSchema: 'your_schema', // prefixes table queries; per-table `schema` overrides it
  tables: [
    {
      name: 'orders',
      description: 'Customer orders',
      accessPolicy: 'user', // 'user' (scoped to the caller) | 'public' | 'admin' (skipped in context)
      columns: [
        { name: 'id', type: 'integer', description: 'Order ID' },
        { name: 'status', type: 'text', description: 'Order status' },
      ],
    },
  ],
  actions: [
    {
      id: 'create-note',
      name: 'Create note',
      description: 'Add a note to an order',
      parameters: [
        { name: 'order_id', type: 'number', required: true, description: 'Order ID' },
        { name: 'text', type: 'string', required: true, description: 'Note body' },
      ],
      handler: 'supabase-insert',
      config: { table: 'notes', schema: 'your_schema' },
    },
  ],
});
```

`id`, `name`, `description`, `tables`, and `actions` are required; `tables` need an `accessPolicy` and typed `columns`; actions need `parameters`, a `handler`, and handler-specific `config`. The registry is in-memory — registrations live for the life of the process and re-registering the same `id` replaces it.

When a chat request carries that `projectId`, Lucy reads up to ~10 rows from each registered table (within a token budget), summarises them, and prepends that context to the system prompt — so "how many open orders?" gets a real answer. `accessPolicy: 'user'` tables are filtered to the caller (by a `user_id` or `sender_id` column); `admin` tables are skipped. If Supabase isn't configured, Lucy still gets a schema-only summary so it knows what data *could* exist.

Action handlers let Lucy act, not just read:

| Handler | Does |
|---|---|
| `supabase-insert` | Inserts a row (auto-injects the caller's id as `sender_id` if absent) |
| `supabase-update` | Updates rows matching `config.matchColumn` |
| `api-call` | POSTs the params to `config.endpoint` |
| `workflow` | Triggers a Lucy workflow by `config.workflowId` |

The identity used for context and inserts is resolved **server-side** from the session (or Lucy API key) — the request body's user id is never trusted.
