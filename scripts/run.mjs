// Railway runs `npm run build` and `npm run start` at the repo root for every service.
// The SERVICE variable (api | web) tells this repo which app that service is.
import { spawnSync } from 'node:child_process';

const mode = process.argv[2];
const svc = (process.env.SERVICE ?? '').trim().toLowerCase();
if (!['api', 'web'].includes(svc)) {
  console.error('\nSERVICE is not set. In Railway open this service > Variables and add  SERVICE=api  (or  SERVICE=web  for the website).\n');
  process.exit(1);
}
const script = { build: { api: 'build:api', web: 'build:web' }, start: { api: 'start:api', web: 'start:web' } }[mode]?.[svc];
if (!script) { console.error(`Unknown mode ${mode}`); process.exit(1); }
console.log(`> ${mode} ${svc}  (npm run ${script})`);
process.exit(spawnSync('npm', ['run', script], { stdio: 'inherit', shell: true }).status ?? 1);
