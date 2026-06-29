# Personas

Personas are reusable system prompts that switch Lucy between modes of working — without retyping instructions. The active persona is sent as the conversation's **system message**, so it shapes every reply in that chat.

## Built-in personas

Lucy ships with five built-ins, always available and selected by default as **General Assistant**:

| Persona | Good for |
|---|---|
| 🤖 General Assistant | Everyday questions and tasks — clear, balanced answers |
| 💻 Code Expert | TypeScript/React/Node, code reviews, debugging |
| ✍️ Creative Writer | Storytelling, copywriting, tone and style work |
| 📊 Data Analyst | SQL, statistics, chart choices, data-quality flags |
| 🎓 Onboarding Guide | Walking new team members through tools and process |

Built-ins are marked with a lock on the **Personas** page. They can't be edited or deleted and are re-seeded on every load, so new releases update them automatically.

## Using a persona

Click the persona chip in the chat input bar (it shows the active icon and name) and pick from the list, or hit **Create Custom Persona** to jump to the full page. The chip's choice takes effect on your **next message** — the active persona is read each time you send, so you can switch mid-conversation. When the active persona is anything other than General Assistant, a "Using *X* persona" indicator shows above the chat.

The persona's prompt becomes the conversation's system message. If a chat already has project context or memory, those are merged into the **same** system message — persona first, then context.

## Custom personas

Open **Personas** in the sidebar (or **Create Custom Persona** from the chip menu), then **Create Custom**:

1. **Icon** — one or two characters (emoji), shown in the selector. Defaults to 🤖.
2. **Name** — required (e.g. "Support agent — Acme tone").
3. **Short description** — the one-line summary shown in the chip dropdown.
4. **System prompt** — required; describes how Lucy should behave. A live character count is shown.

Save stays disabled until both name and system prompt are filled. New personas show in the chip selector and on the page immediately.

Edit or delete a custom persona from its card on the **Personas** page (hover to reveal the actions; delete asks for confirmation). Deleting the active persona falls back to General Assistant. Built-ins offer neither action.

Tips for prompts that work:

- State the **role** ("You are Acme's support engineer") and the **boundaries** ("never promise refunds").
- Specify **output shape** when it matters ("always answer with a numbered checklist").
- Keep it focused — the persona stacks with project context and memory in one system message.

## Where personas persist

Custom personas and your active selection are stored in your browser under `localStorage` key `lucy-personas`. Built-ins are never persisted — they're merged back in on load. There's no server sync, so personas are **per-device**: they don't follow you between browsers or to another machine, even in connected mode.
