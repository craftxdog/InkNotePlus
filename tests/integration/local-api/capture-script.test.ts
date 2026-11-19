import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createLocalApiServer } from '../../../src/main/local-api/http-server';
import { createBackend } from './support';

const run = promisify(execFile);
const script = path.resolve('docs/integrations/inknote-capture.sh');

describe.skipIf(process.platform === 'win32')('capture script', () => {
  let context: ReturnType<typeof createBackend>;
  let server: ReturnType<typeof createLocalApiServer>;
  let port: number;
  beforeEach(async () => {
    context = createBackend();
    server = createLocalApiServer({
      backend: context.backend,
      username: 'inknote',
      password: 'clave "rara" \\ 1',
      version: '1',
    });
    port = await server.listen(0);
  });
  afterEach(async () => {
    await server.close();
    context.close();
  });
  const capture = (text: string, password = 'clave "rara" \\ 1') =>
    run(script, [text], {
      env: {
        PATH: process.env.PATH,
        INKNOTE_API_PASSWORD: password,
        INKNOTE_API_PORT: String(port),
      },
    });

  it('creates a note and uses the first line as its title', async () => {
    await capture('Comprar "pan"\nY leche\tcon \\ barra');
    const { note } = context.events[0];
    expect(note.title).toBe('Comprar "pan"');
    expect(note.body).toBe('Comprar "pan"\nY leche\tcon \\ barra');
    expect(note.metadata?.tags).toEqual(['captura']);
  });

  it('fails visibly with a wrong password', async () => {
    await expect(capture('Texto', 'otra')).rejects.toThrow();
    expect(context.events).toEqual([]);
  });
});
