import type { TestProject } from 'vitest/node';
import { APP_ORIGIN, startServers, stopServers } from './servers.ts';

// Starts the real WebDAV servers before the server tests, and stops them after.

export default function setup(project: TestProject) {
  try {
    project.provide('origin', APP_ORIGIN);
    project.provide('servers', startServers());
  } catch (e) {
    // Vitest fails to show where an error from here came from, and shows its own error
    // (code.charCodeAt is not a function) in place of the message. So: the message only
    const error = new Error((e as Error).message);
    error.stack = `Error: ${error.message}`;
    throw error;
  }
  return stopServers;
}
