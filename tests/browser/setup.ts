import { startServers, stopServers } from '../servers/servers.ts';

// Starts the real WebDAV servers before the browser tests, and stops them after. The tests
// read the servers from SERVERS.

export default function setup() {
  process.env.SERVERS = JSON.stringify(startServers());
  return stopServers;
}
