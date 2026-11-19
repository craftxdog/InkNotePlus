import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { handleMcpMessage } from '../../../src/main/local-api/mcp';
import { createBackend } from './support';

let context: ReturnType<typeof createBackend>;
beforeEach(() => {
  context = createBackend();
});
afterEach(() => context.close());

const rpc = (method: string, params?: unknown, id: number | null = 1) =>
  handleMcpMessage(
    { jsonrpc: '2.0', ...(id === null ? {} : { id }), method, params },
    context.backend,
    '9.9.9',
  );
const tool = async (name: string, args: unknown = {}) => {
  const response = (await rpc('tools/call', { name, arguments: args })) as {
    result: { content: { text: string }[]; isError?: boolean };
  };
  return {
    isError: response.result.isError ?? false,
    data: JSON.parse(response.result.content[0].text),
  };
};

describe('MCP protocol', () => {
  it('negotiates a supported protocol version', async () => {
    const response = await rpc('initialize', {
      protocolVersion: '2025-03-26',
      capabilities: {},
      clientInfo: { name: 'test', version: '1' },
    });
    expect(response).toMatchObject({
      jsonrpc: '2.0',
      id: 1,
      result: {
        protocolVersion: '2025-03-26',
        capabilities: { tools: {} },
        serverInfo: { name: 'InkNote', version: '9.9.9' },
      },
    });
  });

  it('offers its latest version to an unknown client version', async () => {
    const response = (await rpc('initialize', {
      protocolVersion: '1999-01-01',
    })) as { result: { protocolVersion: string } };
    expect(response.result.protocolVersion).toBe('2025-06-18');
  });

  it('does not answer notifications', async () => {
    expect(await rpc('notifications/initialized', {}, null)).toBeNull();
  });

  it('answers ping', async () => {
    expect(await rpc('ping')).toEqual({ jsonrpc: '2.0', id: 1, result: {} });
  });

  it('reports unknown methods and malformed messages', async () => {
    expect(await rpc('nope')).toMatchObject({ error: { code: -32601 } });
    expect(
      await handleMcpMessage({ nope: true }, context.backend, '1'),
    ).toMatchObject({ id: null, error: { code: -32600 } });
    expect(await handleMcpMessage([], context.backend, '1')).toMatchObject({
      error: { code: -32600 },
    });
  });

  it('lists tools with input schemas and no destructive tool', async () => {
    const response = (await rpc('tools/list')) as {
      result: { tools: { name: string; inputSchema: { type: string } }[] };
    };
    const names = response.result.tools.map(({ name }) => name);
    expect(names).toEqual([
      'search_notes',
      'read_note',
      'create_note',
      'update_note',
      'list_notebooks',
      'list_tags',
    ]);
    for (const item of response.result.tools)
      expect(item.inputSchema.type).toBe('object');
  });

  it('rejects an unknown tool', async () => {
    expect(
      await rpc('tools/call', { name: 'delete_all', arguments: {} }),
    ).toMatchObject({ error: { code: -32602 } });
  });
});

describe('MCP tools', () => {
  it('creates, finds, reads and updates a note', async () => {
    const created = await tool('create_note', {
      title: 'Agente',
      body: 'Contenido del agente',
      tags: ['ia'],
    });
    expect(created.isError).toBe(false);
    const found = await tool('search_notes', { query: 'agente' });
    expect(found.data).toMatchObject([
      { id: created.data.id, title: 'Agente', excerpt: 'Contenido del agente' },
    ]);
    const read = await tool('read_note', { id: created.data.id });
    expect(read.data.body).toBe('Contenido del agente');
    const updated = await tool('update_note', {
      id: created.data.id,
      revision: read.data.revision,
      body: 'Editado',
    });
    expect(updated.data).toMatchObject({ title: 'Agente', body: 'Editado' });
    expect(context.events.map(({ type }) => type)).toEqual([
      'created',
      'updated',
    ]);
  });

  it('lists recent notes without a query', async () => {
    await tool('create_note', { title: 'Reciente', body: 'x' });
    expect((await tool('search_notes')).data).toHaveLength(1);
  });

  it('requires the revision to update a note', async () => {
    const created = await tool('create_note', { title: 'T', body: 'B' });
    const result = await tool('update_note', {
      id: created.data.id,
      body: 'Otro',
    });
    expect(result.isError).toBe(true);
  });

  it('reports a stale revision as a tool error', async () => {
    const created = await tool('create_note', { title: 'T', body: 'B' });
    await tool('update_note', {
      id: created.data.id,
      revision: 1,
      body: 'Uno',
    });
    const result = await tool('update_note', {
      id: created.data.id,
      revision: 1,
      body: 'Dos',
    });
    expect(result.isError).toBe(true);
    expect(result.data.error).toContain('Vuelve a leerla');
  });

  it('lists notebooks and tags', async () => {
    const book = context.library.createNotebook({ name: 'Trabajo' });
    await tool('create_note', {
      title: 'T',
      body: 'B',
      bookId: book.id,
      tags: ['ia'],
    });
    expect((await tool('list_notebooks')).data).toMatchObject([
      { name: 'Trabajo' },
    ]);
    expect((await tool('list_tags')).data).toMatchObject([{ name: 'ia' }]);
  });
});
