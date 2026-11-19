import { useEffect, useRef, useState } from 'react';
import { EditorView } from '@codemirror/view';
import { aiErrorMessages } from '../ai/messages';
import { copyText } from '../editor/clipboard';
import { useWorkspace } from '../state/workspace-context';
import { Modal } from './modal';

const presets = [
  ['Mejorar', 'Mejora la claridad y el estilo sin cambiar el significado.'],
  ['Corregir', 'Corrige la ortografía y la gramática.'],
  ['Resumir', 'Resume el texto en pocas frases.'],
  ['Traducir al inglés', 'Traduce el texto al inglés.'],
] as const;

const activeEditor = () => {
  const element = document.querySelector<HTMLElement>('.cm-editor');
  return element ? EditorView.findFromDOM(element) : null;
};

export default function AiAssistantDialog() {
  const target = useWorkspace((state) => state.aiAssistant);
  const close = useWorkspace((state) => state.setAiAssistant);
  const run = useWorkspace((state) => state.runAi);
  const cancel = useWorkspace((state) => state.cancelAi);
  const [instruction, setInstruction] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState<string | null>(null);
  const current = useRef<string | null>(null);
  useEffect(
    () => () => {
      if (current.current) void cancel(current.current);
    },
    [cancel],
  );
  if (!target) return null;

  const submit = async (value: string) => {
    if (!value.trim() || running) return;
    const requestId = crypto.randomUUID();
    current.current = requestId;
    setRunning(requestId);
    setError(null);
    setResult(null);
    const response = await run({
      requestId,
      kind: 'transform',
      instruction: value,
      text: target.text,
    });
    if (current.current !== requestId) return;
    current.current = null;
    setRunning(null);
    if (!response.ok) setError(aiErrorMessages.failed);
    else if (response.data.status === 'ok') setResult(response.data.text);
    else if (response.data.status !== 'cancelled')
      setError(aiErrorMessages[response.data.status]);
  };
  // The note may have changed behind the dialog, so the range is checked again.
  const apply = (mode: 'replace' | 'insert') => {
    const view = activeEditor();
    if (
      !view ||
      result === null ||
      view.state.sliceDoc(target.from, target.to) !== target.text
    ) {
      setError('La nota cambió. Vuelve a abrir el asistente.');
      return;
    }
    view.dispatch({
      changes:
        mode === 'replace'
          ? { from: target.from, to: target.to, insert: result }
          : { from: target.to, insert: `\n\n${result}` },
      userEvent: 'input.complete',
    });
    close(null);
    // Closing the dialog moves focus, so the editor takes it back afterwards.
    requestAnimationFrame(() => view.focus());
  };
  return (
    <Modal
      title="Asistente de IA"
      className="ai-assistant"
      onClose={() => close(null)}
    >
      <div className="dialog-form">
        <p className="settings-description">
          Se enviarán {target.text.length.toLocaleString()} caracteres de esta
          nota a tu proveedor de IA.
        </p>
        <div className="settings-inline-actions">
          {presets.map(([label, value]) => (
            <button
              key={label}
              className="button"
              type="button"
              disabled={!!running}
              onClick={() => void submit(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <textarea
          autoFocus
          rows={3}
          aria-label="Instrucción para la IA"
          placeholder="Escribe qué quieres hacer con el texto"
          value={instruction}
          onChange={(event) => setInstruction(event.target.value)}
        />
        {running && <p role="status">Esperando respuesta…</p>}
        {error && <p role="alert">{error}</p>}
        {result !== null && (
          <pre className="ai-assistant-result" tabIndex={0}>
            {result}
          </pre>
        )}
        <footer className="dialog-actions">
          {running ? (
            <button
              className="button"
              type="button"
              onClick={() => {
                current.current = null;
                setRunning(null);
                void cancel(running);
              }}
            >
              Cancelar
            </button>
          ) : result !== null ? (
            <>
              <button
                className="button"
                type="button"
                onClick={() => void copyText(result)}
              >
                Copiar
              </button>
              <button
                className="button"
                type="button"
                onClick={() => apply('insert')}
              >
                Insertar debajo
              </button>
              <button
                className="button button--primary"
                type="button"
                onClick={() => apply('replace')}
              >
                Reemplazar
              </button>
            </>
          ) : (
            <button
              className="button button--primary"
              type="button"
              disabled={!instruction.trim()}
              onClick={() => void submit(instruction)}
            >
              Enviar
            </button>
          )}
        </footer>
      </div>
    </Modal>
  );
}
