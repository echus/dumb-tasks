// What setup.ts hands the server tests: the origin the servers allow, and each server's
// WebDAV folder and how to sign in.
declare module 'vitest' {
  export interface ProvidedContext {
    origin: string;
    servers: { name: string; url: string; username: string; password: string }[];
  }
}

export {};
