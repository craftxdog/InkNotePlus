import { describe, expect, it, vi } from 'vitest';
import { createLocalApiController } from '../../src/main/local-api/controller';

function setup(listenError?: NodeJS.ErrnoException) {
  const servers: {
    password: string;
    listen: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
  }[] = [];
  let password = 'uno';
  const onChange = vi.fn();
  const controller = createLocalApiController({
    createServer: (value) => {
      const server = {
        password: value,
        listen: vi.fn(async (port: number) => {
          if (listenError) throw listenError;
          return port;
        }),
        close: vi.fn(async () => {}),
      };
      servers.push(server);
      return server;
    },
    credentials: {
      password: () => password,
      regenerate: () => (password = 'dos'),
      persisted: () => true,
    },
    onChange,
  });
  return { controller, servers, onChange };
}

describe('local API controller', () => {
  it('stays off and does not read the password while disabled', async () => {
    const { controller, servers } = setup();
    await controller.apply({ enabled: false, port: 19840 });
    expect(servers).toHaveLength(0);
    expect(controller.status()).toMatchObject({
      enabled: false,
      running: false,
      password: null,
    });
  });

  it('does not touch the system keychain while disabled', async () => {
    const persisted = vi.fn(() => true);
    const controller = createLocalApiController({
      createServer: () => ({
        listen: async (port) => port,
        close: async () => {},
      }),
      credentials: { password: () => 'x', regenerate: () => 'y', persisted },
      onChange: () => {},
    });
    await controller.apply({ enabled: false, port: 19840 });
    controller.status();
    expect(persisted).not.toHaveBeenCalled();
  });

  it('starts on the configured port', async () => {
    const { controller, servers, onChange } = setup();
    await controller.apply({ enabled: true, port: 19840 });
    expect(servers[0].listen).toHaveBeenCalledWith(19840);
    expect(controller.status()).toMatchObject({
      running: true,
      port: 19840,
      username: 'inknote',
      password: 'uno',
      error: null,
    });
    expect(onChange).toHaveBeenCalled();
  });

  it('does not restart when nothing changed', async () => {
    const { controller, servers } = setup();
    await controller.apply({ enabled: true, port: 19840 });
    await controller.apply({ enabled: true, port: 19840 });
    expect(servers).toHaveLength(1);
  });

  it('restarts on a new port', async () => {
    const { controller, servers } = setup();
    await controller.apply({ enabled: true, port: 19840 });
    await controller.apply({ enabled: true, port: 19841 });
    expect(servers[0].close).toHaveBeenCalledOnce();
    expect(servers[1].listen).toHaveBeenCalledWith(19841);
  });

  it('stops when disabled', async () => {
    const { controller, servers } = setup();
    await controller.apply({ enabled: true, port: 19840 });
    await controller.apply({ enabled: false, port: 19840 });
    expect(servers[0].close).toHaveBeenCalledOnce();
    expect(controller.status().running).toBe(false);
  });

  it('reports a port in use', async () => {
    const { controller } = setup(
      Object.assign(new Error('busy'), { code: 'EADDRINUSE' }),
    );
    await controller.apply({ enabled: true, port: 19840 });
    expect(controller.status()).toMatchObject({
      running: false,
      error: 'port_in_use',
    });
  });

  it('applies overlapping changes in order', async () => {
    const { controller, servers } = setup();
    await Promise.all([
      controller.apply({ enabled: true, port: 1 }),
      controller.apply({ enabled: true, port: 2 }),
      controller.apply({ enabled: false, port: 2 }),
    ]);
    expect(servers.map((item) => item.listen.mock.calls[0][0])).toEqual([1, 2]);
    expect(controller.status().running).toBe(false);
  });

  it('restarts with a new password', async () => {
    const { controller, servers } = setup();
    await controller.apply({ enabled: true, port: 19840 });
    await controller.regenerate();
    expect(servers[0].close).toHaveBeenCalledOnce();
    expect(servers[1].password).toBe('dos');
    expect(controller.status().password).toBe('dos');
  });

  it('closes the server on dispose', async () => {
    const { controller, servers } = setup();
    await controller.apply({ enabled: true, port: 19840 });
    await controller.dispose();
    expect(servers[0].close).toHaveBeenCalledOnce();
  });
});
