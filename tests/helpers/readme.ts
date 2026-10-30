// The README's setup for an Apache WebDAV server, so tests can check the app and real servers
// against what it tells people to set up. Each takes the README's text: tests import it as
// '<path to>/README.md?raw', and scripts that run in Node read the file.

/** The example app origin in the README's setup, which people change to their own. */
export const README_ORIGIN = 'https://tasks.example.com';

/** The configuration blocks under "### Apache", as people copy them. */
function apacheBlocks(readme: string): string[] {
  const section = readme.split('\n### Apache\n')[1]?.split('\n## ')[0].split('\n### ')[0] ?? '';
  return [...section.matchAll(/```apache\n([\s\S]*?)\n\s*```/g)].map(([, block]) => {
    const indent = block.match(/^ */)![0].length;
    return block
      .split('\n')
      .map((line) => line.slice(indent))
      .join('\n');
  });
}

function apacheBlock(readme: string, containing: string): string {
  const block = apacheBlocks(readme).find((b) => b.includes(containing));
  if (!block) throw new Error(`No Apache configuration with ${containing} in the README`);
  return block;
}

/** The server-wide setup: the lock database. */
export const readmeApacheServerConfig = (readme: string) => apacheBlock(readme, 'DavLockDB');

/** The setup for the shared folder's `<Directory>`. */
export const readmeApacheFolderConfig = (readme: string) => apacheBlock(readme, 'Dav On');

/** What the README's setup lets the browser send: Access-Control-Allow-Methods or -Headers. */
export function readmeAllows(readme: string, list: 'Methods' | 'Headers'): string[] {
  const config = readmeApacheFolderConfig(readme);
  const value = config.match(new RegExp(`Access-Control-Allow-${list} "([^"]+)"`))?.[1];
  if (!value) throw new Error(`No Access-Control-Allow-${list} in the README's Apache configuration`);
  return value.split(',').map((item) => item.trim());
}
