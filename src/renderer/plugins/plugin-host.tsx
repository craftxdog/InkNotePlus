import { useEffect, useMemo, useRef, useState } from 'react';
import { pluginHostUrl, type PluginBundle } from '../../shared/plugins';
import type { InkNoteApi } from '../../preload/api';
import { useWorkspace, useWorkspaceStore } from '../state/workspace-context';
import { createPluginBroker } from './plugin-broker';

const activationTimeout = 15_000;

function PluginFrame({ name, api }: { name: string; api: InkNoteApi }) {
  const store = useWorkspaceStore();
  const frame = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    let bundle: PluginBundle | null = null;
    const broker = createPluginBroker({ store, api, plugin: name });
    const state = () => store.getState();
    const post = (message: unknown) =>
      frame.current?.contentWindow?.postMessage(message, '*');
    const timer = setTimeout(
      () =>
        state().setPluginStatus(name, 'El plugin tardó demasiado en iniciar.'),
      activationTimeout,
    );
    const stopRunner = state().registerPluginRunner(name, (command) =>
      post({ type: 'command', name: command }),
    );
    async function onMessage(event: MessageEvent) {
      // Only this frame may speak for this plugin.
      if (!frame.current || event.source !== frame.current.contentWindow)
        return;
      const message = event.data as Record<string, unknown>;
      if (message.type === 'ready') {
        const loaded = await api.plugins.load(name);
        bundle = loaded.ok ? loaded.data : null;
        if (!bundle) {
          clearTimeout(timer);
          state().setPluginStatus(name, 'No se pudo leer el plugin.');
          return;
        }
        state().setPluginKeymap(name, bundle.keymap);
        post({ type: 'start', bundle });
      } else if (message.type === 'started') {
        clearTimeout(timer);
        state().setPluginStatus(name, null);
      } else if (message.type === 'failed') {
        clearTimeout(timer);
        state().setPluginStatus(name, String(message.message).slice(0, 300));
      } else if (message.type === 'commands') {
        state().addPluginCommands(
          name,
          (message.names as unknown[]).map(String),
        );
      } else if (message.type === 'commands-removed') {
        state().removePluginCommands(
          name,
          (message.names as unknown[]).map(String),
        );
      } else if (message.type === 'request') {
        const id = message.id;
        try {
          const value = await broker(String(message.method), message.params);
          post({ type: 'response', id, ok: true, value });
        } catch (error) {
          post({
            type: 'response',
            id,
            ok: false,
            error: error instanceof Error ? error.message : 'Error',
          });
        }
      }
    }
    const listener = (event: MessageEvent) => void onMessage(event);
    window.addEventListener('message', listener);
    return () => {
      clearTimeout(timer);
      post({ type: 'stop' });
      window.removeEventListener('message', listener);
      stopRunner();
      state().clearPlugin(name);
    };
  }, [api, name, store]);
  return (
    <iframe
      ref={frame}
      className="plugin-frame"
      title={`Plugin ${name}`}
      src={pluginHostUrl}
      sandbox="allow-scripts"
      aria-hidden="true"
      tabIndex={-1}
    />
  );
}

export function PluginHost() {
  const enabled = useWorkspace((state) => state.preferences.enabledPlugins);
  const init = useWorkspace((state) => state.preferences.initScriptEnabled);
  const api = useWorkspace((state) => state.pluginApi);
  const names = useMemo(
    () => [...new Set([...enabled, ...(init ? ['init'] : [])])],
    [enabled, init],
  );
  return (
    <>
      {names.map((name) => (
        <PluginFrame key={name} name={name} api={api} />
      ))}
      <PluginNotices />
    </>
  );
}

function PluginNotices() {
  const notices = useWorkspace((state) => state.pluginNotices);
  const dismiss = useWorkspace((state) => state.dismissPluginNotice);
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!notices.length) return;
    const timer = setTimeout(() => {
      dismiss(notices[0].id);
      setNow((value) => value + 1);
    }, 6000);
    return () => clearTimeout(timer);
  }, [dismiss, notices, now]);
  if (!notices.length) return null;
  return (
    <div className="plugin-notices" role="status" aria-live="polite">
      {notices.map(({ id, plugin, level, message, detail }) => (
        <div className="plugin-notice" data-level={level} key={id}>
          <strong>{plugin}</strong>
          <span>{message}</span>
          {detail && <small>{detail}</small>}
          <button
            className="button"
            type="button"
            aria-label="Cerrar aviso"
            onClick={() => dismiss(id)}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
