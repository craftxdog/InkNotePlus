import { z } from '../../shared/validation';
import { noteStatusSchema } from '../../shared/note-metadata';
import type { NotesBackend } from './notes-backend';
import { handleApiRequest, type ApiResponse } from './routes';

// https://modelcontextprotocol.io/specification/2025-06-18/basic/transports
export const mcpProtocolVersions = [
  '2025-06-18',
  '2025-03-26',
  '2024-11-05',
] as const;

const messageSchema = z.object({
  jsonrpc: z.literal('2.0'),
  id: z.union([z.string(), z.number()]).optional(),
  method: z.string(),
  params: z.unknown().optional(),
});
const callSchema = z.object({
  name: z.string(),
  arguments: z.record(z.string(), z.unknown()).optional(),
});

const text = { type: 'string' } as const;
const noteProperties = {
  title: text,
  body: { type: 'string', description: 'Contenido en Markdown.' },
  bookId: { type: 'string', description: 'ID del notebook.' },
  tags: { type: 'array', items: text },
  status: { type: 'string', enum: noteStatusSchema.options },
} as const;
const object = (
  properties: Record<string, unknown> = {},
  required: string[] = [],
) => ({ type: 'object', properties, required, additionalProperties: false });

const tools = [
  {
    name: 'search_notes',
    description:
      'Busca notas por texto. Sin consulta devuelve las más recientes.',
    inputSchema: object({
      query: text,
      limit: { type: 'integer', minimum: 1, maximum: 100 },
      bookId: text,
      tag: text,
      status: noteProperties.status,
    }),
  },
  {
    name: 'read_note',
    description: 'Lee una nota completa por su ID.',
    inputSchema: object({ id: text }, ['id']),
  },
  {
    name: 'create_note',
    description: 'Crea una nota nueva.',
    inputSchema: object(noteProperties, ['title', 'body']),
  },
  {
    name: 'update_note',
    description:
      'Edita una nota. Lee antes la nota y envía su revisión para no sobrescribir cambios.',
    inputSchema: object(
      {
        id: text,
        revision: { type: 'integer', minimum: 1 },
        ...noteProperties,
      },
      ['id', 'revision'],
    ),
  },
  {
    name: 'list_notebooks',
    description: 'Lista los notebooks.',
    inputSchema: object(),
  },
  {
    name: 'list_tags',
    description: 'Lista las etiquetas.',
    inputSchema: object(),
  },
];

const failedTool = (message: string) => ({
  content: [{ type: 'text', text: JSON.stringify({ error: message }) }],
  isError: true,
});
const toolResult = ({ status, body }: ApiResponse) =>
  status < 400
    ? { content: [{ type: 'text', text: JSON.stringify(body) }] }
    : failedTool((body as { error: string }).error);

async function callTool(
  name: string,
  args: Record<string, unknown>,
  backend: NotesBackend,
) {
  const api = (method: string, path: string, body?: unknown, query = {}) =>
    handleApiRequest(
      { method, path, query: new URLSearchParams(query), body },
      backend,
    );
  const noteId = encodeURIComponent(String(args.id ?? ''));
  switch (name) {
    case 'search_notes': {
      const { query, ...filters } = args;
      const response = await api('GET', '/notes', undefined, {
        ...Object.fromEntries(
          Object.entries(filters).map(([key, value]) => [key, String(value)]),
        ),
        ...(typeof query === 'string' ? { keyword: query } : {}),
      });
      if (response.status >= 400) return toolResult(response);
      const notes = response.body as { body: string }[];
      return toolResult({
        status: 200,
        body: notes.map(({ body, ...note }) => ({
          ...note,
          excerpt: body.slice(0, 200),
        })),
      });
    }
    case 'read_note':
      return toolResult(await api('GET', `/notes/${noteId}`));
    case 'create_note':
      return toolResult(await api('POST', '/notes', args));
    case 'update_note': {
      if (!Number.isInteger(args.revision))
        return failedTool('Lee la nota y envía su revisión.');
      const { id: _id, ...patch } = args;
      return toolResult(await api('PATCH', `/notes/${noteId}`, patch));
    }
    case 'list_notebooks':
      return toolResult(await api('GET', '/books'));
    default:
      return toolResult(await api('GET', '/tags'));
  }
}

export async function handleMcpMessage(
  value: unknown,
  backend: NotesBackend,
  version: string,
) {
  const message = messageSchema.safeParse(value);
  if (!message.success)
    return {
      jsonrpc: '2.0',
      id: null,
      error: { code: -32600, message: 'Invalid Request' },
    };
  const { id, method, params } = message.data;
  if (id === undefined) return null;
  const result = (data: unknown) => ({ jsonrpc: '2.0', id, result: data });
  const error = (code: number, text: string) => ({
    jsonrpc: '2.0',
    id,
    error: { code, message: text },
  });
  switch (method) {
    case 'initialize': {
      const requested = (params as { protocolVersion?: string } | undefined)
        ?.protocolVersion;
      return result({
        protocolVersion:
          mcpProtocolVersions.find((item) => item === requested) ??
          mcpProtocolVersions[0],
        capabilities: { tools: {} },
        serverInfo: { name: 'InkNote', version },
      });
    }
    case 'ping':
      return result({});
    case 'tools/list':
      return result({ tools });
    case 'tools/call': {
      const call = callSchema.safeParse(params);
      if (!call.success || !tools.some(({ name }) => name === call.data.name))
        return error(-32602, 'Unknown tool');
      return result(
        await callTool(call.data.name, call.data.arguments ?? {}, backend),
      );
    }
    default:
      return error(-32601, 'Method not found');
  }
}
