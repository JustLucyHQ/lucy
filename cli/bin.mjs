#!/usr/bin/env node
// Bin shim: runs the TypeScript CLI through tsx (a repo devDependency).
// Lets `npm link` / `npm install -g .` expose a global `lucy` command.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const dir = dirname(fileURLToPath(import.meta.url));
const result = spawnSync('npx', ['tsx', join(dir, 'index.ts'), ...process.argv.slice(2)], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
process.exit(result.status ?? 0);
