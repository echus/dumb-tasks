// What setup.ts hands the server tests: each server's WebDAV folder, and how to sign in.
declare module 'vitest' {
  export interface ProvidedContext {
    servers: { name: string; url: string; username: string; password: string }[];
  }
}

export {};
