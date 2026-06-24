import { execFileSync } from 'node:child_process';

const scope = 'illyeong-s-projects';
const aliasDomain = 'level-up-class.vercel.app';

const run = (command, args) => execFileSync(command, args, {
  cwd: new URL('..', import.meta.url),
  encoding: 'utf8',
  stdio: ['inherit', 'pipe', 'inherit'],
  shell: process.platform === 'win32',
});

const deployOutput = run('npx', ['vercel', '--prod', '--yes', '--scope', scope]);
process.stdout.write(deployOutput);

const deploymentUrl = deployOutput
  .split(/\r?\n/)
  .map(line => line.trim())
  .find(line => /^https:\/\/level-up-class-[\w-]+\.vercel\.app$/.test(line));

if (!deploymentUrl) {
  throw new Error('Could not find the Vercel deployment URL in deploy output.');
}

const source = deploymentUrl.replace(/^https:\/\//, '');
const aliasOutput = run('npx', ['vercel', 'alias', 'set', source, aliasDomain, '--scope', scope]);
process.stdout.write(aliasOutput);

console.log(`\nProduction is live at https://${aliasDomain}`);
