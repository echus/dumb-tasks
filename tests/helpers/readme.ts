import README from '../../README.md?raw';

// The README's setup for an Apache WebDAV server, so tests can check the app and real servers
// against what it tells people to set up.

/** The configuration blocks under "### Apache", as people copy them. */
function apacheBlocks(): string[] {
  const section = README.split('\n### Apache\n')[1]?.split('\n## ')[0].split('\n### ')[0] ?? '';
  return [...section.matchAll(/```apache\n([\s\S]*?)\n\s*```/g)].map(([, block]) => {
    const indent = block.match(/^ */)![0].length;
    return block
      .split('\n')
      .map((line) => line.slice(indent))
      .join('\n');
  });
}

function apacheBlock(containing: string): string {
  const block = apacheBlocks().find((b) => b.includes(containing));
  if (!block) throw new Error(`No Apache configuration with ${containing} in the README`);
  return block;
}

/** The server-wide setup: the lock database. */
export const readmeApacheServerConfig = () => apacheBlock('DavLockDB');

/** The setup for the shared folder's `<Directory>`. */
export const readmeApacheFolderConfig = () => apacheBlock('Dav On');

/** What the README's setup lets the browser send: Access-Control-Allow-Methods or -Headers. */
export function readmeAllows(list: 'Methods' | 'Headers'): string[] {
  const value = readmeApacheFolderConfig().match(new RegExp(`Access-Control-Allow-${list} "([^"]+)"`))?.[1];
  if (!value) throw new Error(`No Access-Control-Allow-${list} in the README's Apache configuration`);
  return value.split(',').map((item) => item.trim());
}
