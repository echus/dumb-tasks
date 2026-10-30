import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { TestProject } from 'vitest/node';
import { readmeApacheFolderConfig, readmeApacheServerConfig } from '../helpers/readme.ts';

// Starts the real WebDAV servers (docker-compose.yml) before the server tests, and stops them
// after. KEEP_SERVERS=1 leaves them running, so the next run starts in seconds.

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));
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
  occ(['config:app:set', 'webapppassword', 'origins', '--value=https://tasks.example.com']);
  // Else Nextcloud slows down every sign-in after the tests' wrong passwords
  occ(['config:system:set', 'auth.bruteforce.protection.enabled', '--type=boolean', '--value=false']);
  const reply = occ(['user:auth-tokens:add', '--password-from-env', '--name=server-tests', 'me'], {
    NC_PASS: 'test-only-admin-password',
  });
  const password = reply.match(/app password:\s*(\S+)/i)?.[1];
  if (!password) throw new Error(`Nextcloud made no app password:\n${reply}`);
  return password;
}

export default function setup(project: TestProject) {
  try {
    return start(project);
  } catch (e) {
    // Vitest fails to show where an error from here came from, and shows its own error
    // (code.charCodeAt is not a function) in place of the message. So: the message only
    const error = new Error((e as Error).message);
    error.stack = `Error: ${error.message}`;
    throw error;
  }
}

function start(project: TestProject) {
  try {
    execFileSync('docker', ['info'], { stdio: 'ignore' });
  } catch {
    throw new Error('The server tests need Docker. Start Docker, then try again.');
  }

  // The README's Apache setup, as is
  writeFileSync(here('apache/readme-server.conf'), readmeApacheServerConfig() + '\n');
  writeFileSync(here('apache/readme-folder.conf'), readmeApacheFolderConfig() + '\n');
  compose('up', '-d', '--wait', '--force-recreate', 'apache'); // fresh, to read the setup again
  compose('up', '-d', '--wait', 'nextcloud'); // installs itself the first time: about a minute

  project.provide('servers', [
    { name: 'Apache', url: `http://localhost:${APACHE_PORT}/webdav/`, username: 'me', password: 'secret' },
    {
      name: 'Nextcloud',
      url: `http://localhost:${NEXTCLOUD_PORT}/remote.php/dav/files/me/`,
      username: 'me',
      password: setUpNextcloud(),
    },
  ]);

  return () => {
    if (!process.env.KEEP_SERVERS) compose('down', '--volumes');
  };
}
