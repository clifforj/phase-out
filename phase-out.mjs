#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const web = join(root, 'web');
const argv = process.argv.slice(2);
const dryRun = argv.includes('--dry-run');
const args = argv.filter((arg) => arg !== '--dry-run');
const [command = 'help', target] = args;
const project = process.env.PHASE_OUT_PROJECT || 'phase-out-local';

function run(program, parameters, cwd = root) {
  console.log('> ' + [program, ...parameters].join(' '));
  if (dryRun) return;
  // Windows npm is a command shim; the other executables do not need a shell.
  const result = spawnSync(program, parameters, {
    cwd,
    stdio: 'inherit',
    shell: process.platform === 'win32' && program === 'npm',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(program + ' exited with status ' + result.status);
}

function compose(parameters, images = false) {
  const files = ['-f', join(root, 'docker-compose.yml')];
  if (images) files.push('-f', join(root, 'docker-compose.images.yml'));
  run('docker', ['compose', '--project-directory', root, '-p', project, ...files, ...parameters]);
}

function source() {
  if (!existsSync(join(root, 'vendor/xmage/pom.xml'))) {
    run('git', ['submodule', 'update', '--init', '--recursive']);
  }
}

function dependencies() {
  if (!existsSync(join(web, 'node_modules/@angular/cli/bin/ng.js'))) {
    run('npm', ['ci'], web);
  }
}

function artwork() {
  if (!existsSync(join(web, 'public/card-images.json')) ||
      !existsSync(join(web, 'public/token-images.json'))) {
    source();
    run('node', [join(root, 'tools/card-art/build-index.mjs')]);
  }
}

function webTests() {
  dependencies();
  run('npm', ['test', '--', '--watch=false'], web);
}

function bridgeTests() {
  source();
  run('docker', ['build', '--target', 'test', '-t', 'phase-out-test', '-f', 'docker/game/Dockerfile', '.']);
}

function help() {
  console.log(`
Phase Out

  node phase-out.mjs start          Pull and run prebuilt images
  node phase-out.mjs stop           Stop the local stack; keep its data
  node phase-out.mjs logs [service] Follow logs (game by default)
  node phase-out.mjs dev            Build the game server and run the web dev server
  node phase-out.mjs build [service] Build game, web, or both from source
  node phase-out.mjs test [suite]   Run web, bridge, or all tests (all by default)

Copy .env.example to .env and set IMAGE_REPOSITORY before starting prebuilt images.
Set PRIVACY_CONTACT_EMAIL before building the web image.
The app opens at http://localhost:8081; the dev server uses http://localhost:4200.
Ctrl-C stops the dev server. Use "stop" to stop its backend.

The local Compose project is "${project}".
Override it with PHASE_OUT_PROJECT. Production uses docker/deploy.sh separately.
Add --dry-run to print commands without executing them.
`);
}

try {
  if (args.length > 2) throw new Error('Too many arguments. Run with help for usage.');
  switch (command) {
    case 'start':
      if (target) throw new Error('start does not take a service name');
      compose(['pull'], true);
      compose(['up', '-d', '--no-build'], true);
      console.log('App: http://localhost:8081');
      break;
    case 'stop':
      if (target) throw new Error('stop does not take a service name');
      compose(['down']);
      break;
    case 'logs':
      if (target && !['game', 'web'].includes(target)) throw new Error('Service must be game or web');
      compose(['logs', '-f', target || 'game']);
      break;
    case 'dev':
      if (target) throw new Error('dev does not take a service name');
      source();
      artwork();
      dependencies();
      compose(['up', '-d', '--build', 'game']);
      run('npm', ['start'], web);
      break;
    case 'build':
      if (target && !['game', 'web'].includes(target)) throw new Error('Service must be game or web');
      source();
      if (target !== 'game') artwork();
      compose(['build', ...(target ? [target] : [])]);
      break;
    case 'test':
      if (target && !['web', 'bridge', 'all'].includes(target)) throw new Error('Suite must be web, bridge, or all');
      if (target !== 'bridge') webTests();
      if (target !== 'web') bridgeTests();
      break;
    case 'help':
    case '--help':
    case '-h':
      help();
      break;
    default:
      throw new Error('Unknown command "' + command + '". Run with help for usage.');
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
