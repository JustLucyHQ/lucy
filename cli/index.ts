/**
 * Lucy CLI — chat with Lucy and manage your deployment from the terminal.
 *
 * A thin client over Lucy's HTTP API: authenticates with a Lucy API key
 * (Settings → API Access) against the server in ~/.lucy/config.json or
 * LUCY_URL / LUCY_API_KEY. Never touches the database directly.
 *
 *   npm run lucy -- chat                    (in the repo)
 *   npx tsx cli/index.ts chat "question"
 */
import { chatCommand, modelsCommand } from './chat';
import { loginCommand, whoamiCommand, memoriesCommand, screeningsCommand, adminCommand } from './ops';
import { c, loadConfig } from './config';
import { welcome } from './ui';

const HELP = `
${c.bold(c.purple('lucy'))} — your AI, in your terminal

${c.bold('Usage')}
  lucy chat                       interactive chat (streaming)
  lucy chat "question"            one-shot — pipe-friendly: cat log.txt | lucy chat "explain"
  lucy chat -m <model-id>         pick a model (see: lucy models)
  lucy models [--local]           list models; --local probes Ollama/LM Studio
  lucy memories                   list what Lucy remembers
  lucy memories remember <fact>   save a fact
  lucy memories global <fact>     save shared knowledge
  lucy memories forget <topic>    delete matching memories
  lucy screenings [get <id>]      screening API
  lucy admin [grant|revoke <email>]  user roles (admins only)
  lucy whoami                     show server, key, admin status
  lucy login                      configure server URL + API key

${c.bold('Setup')}
  1. Create an API key in Lucy → Settings → API Access
  2. lucy login
`;

async function main(): Promise<void> {
  const [cmd, ...args] = process.argv.slice(2);

  switch (cmd) {
    case 'chat': return chatCommand(args);
    case 'models': return modelsCommand(args);
    case 'memories': return memoriesCommand(args);
    case 'screenings': return screeningsCommand(args);
    case 'admin': return adminCommand(args);
    case 'whoami': return whoamiCommand();
    case 'login': return loginCommand();
    case 'help':
    case '--help':
    case '-h':
    case undefined:
      console.log(welcome(loadConfig().url));
      console.log(HELP);
      return;
    default:
      console.error(c.red(`Unknown command: ${cmd}`));
      console.log(HELP);
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(c.red(`✗ ${err instanceof Error ? err.message : String(err)}`));
  process.exit(1);
});
