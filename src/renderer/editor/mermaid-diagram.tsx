import { useEffect, useState } from 'react';
import {
  MermaidDiagram,
  createKatexMath,
  type MermaidButtonProps,
} from '../vendor/inkdrop-mermaid/src';
import type { MathResolver } from 'pele';
import '@inkdropapp/css/mermaid.css';
import '../vendor/inkdrop-mermaid/styles/mermaid.css';
import { useWorkspace } from '../state/workspace-context';
import { Modal } from '../components/modal';

let mathPromise: Promise<MathResolver> | undefined;
function loadMath() {
  return (mathPromise ??= import('katex').then(({ default: katex }) =>
    createKatexMath({
      renderToString: (source, options) =>
        katex.renderToString(source, {
          ...options,
          trust: false,
          maxExpand: 1000,
          maxSize: 20,
        }),
    }),
  ));
}
function DiagramButton({ tooltip, bare: _bare, ...props }: MermaidButtonProps) {
  const labels: Record<string, string> = {
    'Zoom in': 'Ampliar diagrama',
    'Zoom out': 'Reducir diagrama',
    'Reset zoom': 'Restablecer zoom',
    'Full screen': 'Pantalla completa',
  };
  const label = labels[props['aria-label'] ?? ''] ?? props['aria-label'];
  return (
    <button
      {...props}
      type="button"
      aria-label={label}
      title={label ?? (typeof tooltip === 'string' ? tooltip : undefined)}
      className="icon-button"
    />
  );
}

export default function Diagram({ code }: { code: string }) {
  const theme = useWorkspace((state) => state.preferences.theme);
  const fontFamily = useWorkspace(
    (state) => state.preferences.previewFontFamily,
  );
  const fontSize = useWorkspace((state) => state.preferences.previewFontSize);
  const panZoom = useWorkspace((state) => state.preferences.mermaidPanZoom);
  const toolbar = useWorkspace((state) => state.preferences.mermaidToolbar);
  const openLink = useWorkspace((state) => state.openExternalLink);
  const [expanded, setExpanded] = useState(false);
  const [math, setMath] = useState<MathResolver>();
  const hasMath = code.includes('$$');
  useEffect(() => {
    if (!hasMath) return;
    let current = true;
    void loadMath().then((resolver) => {
      if (current) setMath(() => resolver);
    });
    return () => {
      current = false;
    };
  }, [hasMath]);
  const props = {
    code,
    Button: DiagramButton,
    themeRevision: `${theme}:${fontFamily}:${fontSize}`,
    math,
    panZoom,
    toolbar,
  };
  return (
    <div
      className="diagram-block"
      onClick={(event) => {
        const link = (event.target as Element).closest('a');
        if (link) {
          event.preventDefault();
          event.stopPropagation();
          const url =
            link.getAttribute('href') ?? link.getAttribute('xlink:href');
          if (url) void openLink(url);
        }
      }}
    >
      <MermaidDiagram {...props} onExpand={() => setExpanded(true)} />
      {expanded && (
        <Modal
          title="Diagrama Mermaid"
          className="diagram-dialog"
          onClose={() => setExpanded(false)}
        >
          <MermaidDiagram {...props} fill toolbar />
        </Modal>
      )}
    </div>
  );
}
