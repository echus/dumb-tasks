import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { readmeApacheFolderConfig, readmeApacheServerConfig, README_ORIGIN } from '../helpers/readme.ts';

// Starts the real WebDAV servers (docker-compose.yml), set up as the README says, for the
// server tests and the browser tests. KEEP_SERVERS=1 leaves them running after the tests,
// so the next run starts in seconds.

/** Where the browser tests open the app (npm run preview): the origin the servers allow. */
export const APP_ORIGIN = 'http://localhost:4173';

export interface Server {
  name: string;
  url: string; // the WebDAV folder to connect to
  username: string;
  password: string;
}

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));
const README = readFileSync(here('../../README.md'), 'utf8');
const APACHE_PORT = process.env.APACHE_PORT ?? '8081';
const NEXTCLOUD_PORT = process.env.NEXTCLOUD_PORT ?? '8082';

function compose(...args: string[]): string {
  return execFileSync('docker', ['compose', '-f', here('docker-compose.yml'), ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  });
}

/** Nextcloud's admin command line. */
function occ(args: string[], env: Record<string, string> = {}): string {
  const vars = Object.entries(env).flatMap(([name, value]) => ['-e', `${name}=${value}`]);
  return compose('exec', '-T', '-u', 'www-data', ...vars, 'nextcloud', 'php', 'occ', ...args);
}

/** Sets Nextcloud up as the README says, and returns an app password to sign in with. */
function setUpNextcloud(): string {
  try {
    occ(['app:install', 'webapppassword']); // from Nextcloud's app store, so needs the internet
  } catch {
    occ(['app:enable', 'webapppassword']); // installed by an earlier run
  }
  occ(['config:app:set', 'webapppassword', 'origins', `--value=${APP_ORIGIN}`]);
  // Else Nextcloud slows down every sign-in after the tests' wrong passwords
  occ(['config:system:set', 'auth.bruteforce.protection.enabled', '--type=boolean', '--value=false']);
  const reply = occ(['user:auth-tokens:add', '--password-from-env', '--name=tests', 'me'], {
    NC_PASS: 'test-only-admin-password',
  });
  const password = reply.match(/app password:\s*(\S+)/i)?.[1];
  if (!password) throw new Error(`Nextcloud made no app password:\n${reply}`);
  return password;
}

export function startServers(): Server[] {
  try {
    execFileSync('docker', ['info'], { stdio: 'ignore' });
  } catch {
    throw new Error('These tests need Docker. Start Docker, then try again.');
  }

  // The README's Apache setup, as is, with the app's origin in place of its example
  const folderConfig = readmeApacheFolderConfig(README).replaceAll(README_ORIGIN, APP_ORIGIN);
  writeFileSync(here('apache/readme-server.conf'), readmeApacheServerConfig(README) + '\n');
  writeFileSync(here('apache/readme-folder.conf'), folderConfig + '\n');
  compose('up', '-d', '--wait', '--force-recreate', 'apache'); // fresh, to read the setup again
  compose('up', '-d', '--wait', 'nextcloud'); // installs itself the first time: about a minute

  return [
    { name: 'Apache', url: `http://localhost:${APACHE_PORT}/webdav/`, username: 'me', password: 'secret' },
    {
      name: 'Nextcloud',
      url: `http://localhost:${NEXTCLOUD_PORT}/remote.php/dav/files/me/`,
      username: 'me',
      password: setUpNextcloud(),
    },
  ];
}

export function stopServers() {
  if (!process.env.KEEP_SERVERS) compose('down', '--volumes');
}

/** Removes the app's folder from the server: as before any device synced. */
export async function emptyServer(server: Server) {
  await fetch(new URL('dumb-tasks/', server.url), {
    method: 'DELETE',
    headers: { Authorization: `Basic ${btoa(`${server.username}:${server.password}`)}` },
  });
}
