/** Ops subcommands: login, whoami, memories, screenings, admin. */
import { createInterface } from 'node:readline/promises';
import { api } from './http';
import { loadConfig, saveConfig, c, fail } from './config';
import { box } from './ui';

export async function loginCommand(): Promise<void> {
  const current = loadConfig();
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const url = (await rl.question(`Lucy URL ${c.dim(`[${current.url}]`)}: `)).trim() || current.url;
  const apiKey =
    (await rl.question(`API key ${c.dim(current.apiKey ? '[keep existing]' : '(lucy_k_…, from Settings → API Access)')}: `)).trim() ||
    current.apiKey;
  rl.close();

  if (!apiKey) fail('An API key is required. Create one in Lucy → Settings → API Access.');
  const path = saveConfig({ url: url.replace(/\/+$/, ''), apiKey });
  console.log(c.green(`✓ saved ${path}`));
  await whoamiCommand();
}

export async function whoamiCommand(): Promise<void> {
  const { url, apiKey } = loadConfig();
  console.log(`server  ${c.bold(url)}`);
  if (!apiKey) {
    console.log(`key     ${c.yellow('not set')} — run \`lucy login\``);
    return;
  }
  console.log(`key     ${apiKey.slice(0, 12)}…`);
  const me = await api<{ isAdmin: boolean }>('/api/admin/me');
  console.log(`admin   ${me.isAdmin ? c.green('yes') : c.dim('no')}`);
}

export async function memoriesCommand(args: string[]): Promise<void> {
  const [sub, ...rest] = args;
  const text = rest.join(' ').trim();

  if (sub === 'remember' || sub === 'global') {
    if (!text) fail(`usage: lucy memories ${sub} <fact>`);
    await api('/api/memory/command', { method: 'POST', body: JSON.stringify({ kind: sub, text }) });
    console.log(c.green('✓ saved'));
    return;
  }
  if (sub === 'forget') {
    if (!text) fail('usage: lucy memories forget <topic>');
    await api('/api/memory/forget', { method: 'POST', body: JSON.stringify({ text }) });
    console.log(c.green('✓ forgotten'));
    return;
  }

  // default: list
  const data = await api<{
    memories: { id: string; content?: string; text?: string; type?: string; created_at?: string }[];
    usage: { memories: number; bytes: number };
  }>('/api/memory/list');
  if (data.memories.length === 0) {
    console.log(c.dim('No memories stored.'));
    return;
  }
  console.log(
    box(
      data.memories.map((m) => {
        const body = (m.content ?? m.text ?? '').replace(/\s+/g, ' ');
        const clipped = body.length > 60 ? body.slice(0, 57) + '…' : body;
        return `${c.dim((m.created_at ?? '').slice(0, 10))}  ${c.purple((m.type ?? 'memory').padEnd(8))}  ${clipped}`;
      })
    )
  );
  console.log(c.dim(`${data.usage.memories} memories · ${(data.usage.bytes / 1024).toFixed(1)} KB`));
}

export async function screeningsCommand(args: string[]): Promise<void> {
  const [sub, id] = args;
  if (sub === 'get' && id) {
    const s = await api<Record<string, unknown>>(`/api/screening/${id}`);
    console.log(JSON.stringify(s, null, 2));
    return;
  }
  const list = await api<{ id: string; screening_type: string; status: string; grade: number | null; created_at: string }[]>(
    '/api/screening'
  );
  if (list.length === 0) {
    console.log(c.dim('No screenings.'));
    return;
  }
  for (const s of list) {
    console.log(
      `${c.dim(s.created_at.slice(0, 10))} ${s.id.slice(0, 8)} ${s.screening_type.padEnd(20)} ${s.status.padEnd(18)} ${
        s.grade != null ? c.bold(`grade ${s.grade}`) : c.dim('—')
      }`
    );
  }
}

export async function adminCommand(args: string[]): Promise<void> {
  const [sub, email] = args;

  if ((sub === 'grant' || sub === 'revoke') && email) {
    const users = await api<{ users: { id: string; email: string; role: string }[] }>('/api/admin/roles');
    const target = users.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
    if (!target) fail(`No user with email ${email}`);
    await api('/api/admin/roles', {
      method: 'POST',
      body: JSON.stringify({ userId: target.id, role: sub === 'grant' ? 'admin' : 'member' }),
    });
    console.log(c.green(`✓ ${email} → ${sub === 'grant' ? 'admin' : 'member'}`));
    return;
  }

  // default: list
  const data = await api<{ users: { email: string; role: string; created_at: string | null }[] }>('/api/admin/roles');
  if (!data.users.length) {
    console.log(c.dim('No users returned (the self-hosted auth server may not expose listUsers).'));
    return;
  }
  const w = Math.max(...data.users.map((u) => u.email.length)) + 2;
  console.log(
    box(
      data.users.map((u) => {
        const role = u.role === 'admin' ? c.green('ADMIN ') : c.dim('member');
        return `${role}  ${u.email.padEnd(w)}${c.dim((u.created_at ?? '').slice(0, 10))}`;
      })
    )
  );
}
