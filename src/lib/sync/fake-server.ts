// For tests only: what the fake servers (fake-dav.ts, fake-drive.ts) have in common.

export interface FakeServer {
  root: string; // every address the server answers starts with this
  fetch: typeof fetch;
}

/** A fetch that sends each request to the server it's for. */
export function serve(...servers: FakeServer[]): typeof fetch {
  return (input, init) => {
    const server = servers.find((s) => String(input).startsWith(s.root));
    if (!server) return Promise.reject(new TypeError(`No server at ${input}`)); // as fetch does
    return server.fetch(input, init);
  };
}

/** Holds back a fake server's replies, to make it slow on cue. */
export class Gate {
  private held: { arrived: () => void; released: Promise<void> } | null = null;

  /** Holds back every reply until release(). `arrived` settles once a request is waiting. */
  hold(): { arrived: Promise<void>; release: () => void } {
    let arrived!: () => void;
    let release!: () => void;
    const hasArrived = new Promise<void>((resolve) => (arrived = resolve));
    const released = new Promise<void>((resolve) => (release = resolve));
    this.held = { arrived, released };
    return {
      arrived: hasArrived,
      release: () => {
        this.held = null;
        release();
      },
    };
  }

  /** Called by the server with each request: waits while replies are held back. */
  async pass() {
    const held = this.held;
    if (!held) return;
    held.arrived();
    await held.released;
  }
}
