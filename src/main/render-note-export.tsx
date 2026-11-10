import type { ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  MarkdownAsync,
  defaultUrlTransform,
  type Components,
  type ExtraProps,
} from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import type { Note } from '../domain/note';
import type { Preferences } from '../shared/preferences';
import { managedImageUrlPattern } from '../shared/images';
import { remarkGithubAlerts } from '../renderer/editor/github-alerts';
import { remarkHighlights } from '../renderer/editor/highlights';
import { parseImageDimensions } from '../renderer/editor/image-dimensions';
import {
  HighlightedCode,
  MarkdownAlert,
  readMarkdownFence,
} from '../renderer/editor/markdown-presentation';
import {
  MathEquation,
  type MathEquationProps,
} from '../renderer/vendor/inkdrop-math/src/math';
import { attachmentName } from './markdown-export';
import { readAvailableImage } from './transfer-files';

type ExportPreferences = Pick<Preferences, 'mathEnabled' | 'mermaidEnabled'>;
const plugins = [remarkGfm, remarkMath, remarkGithubAlerts, remarkHighlights];
const mathOptions: MathEquationProps['options'] = {
  output: 'mathml',
  trust: false,
  maxExpand: 1000,
  maxSize: 20,
  strict: 'ignore',
};

export async function renderNoteExport(
  note: Note,
  preferences: ExportPreferences,
  imageSource: string,
) {
  const images = new Map<string, string | null>();
  const diagrams = new Map<string, string | null>();

  const components: Components = {
    div: MarkdownAlert,
    code({ children, className }) {
      return className?.includes('math-inline') && preferences.mathEnabled ? (
        <MathEquation code={String(children)} inline options={mathOptions} />
      ) : (
        <HighlightedCode className={className}>
          {String(children)}
        </HighlightedCode>
      );
    },
    pre({ node, children }) {
      const { language, text } = readMarkdownFence(node);
      if (language === 'language-math' && preferences.mathEnabled)
        return <MathEquation code={text} options={mathOptions} />;
      const diagram =
        language === 'language-mermaid' ? diagrams.get(text) : null;
      return diagram ? (
        <figure>
          <img src={diagram} alt="Diagrama Mermaid" />
        </figure>
      ) : (
        <pre>{children}</pre>
      );
    },
    img({ src, alt }: ComponentProps<'img'>) {
      const { caption, width, height } = parseImageDimensions(alt ?? '');
      const data = typeof src === 'string' ? images.get(src) : undefined;
      return data ? (
        <img src={data} alt={caption} style={{ width, height }} />
      ) : (
        <span>{caption ? `[Imagen: ${caption}]` : '[Imagen]'}</span>
      );
    },
  };
  const body = await MarkdownAsync({
    children: note.body,
    remarkPlugins: plugins,
    rehypePlugins: [prepareMedia],
    skipHtml: true,
    components,
    urlTransform: (url, key) =>
      key === 'src'
        ? images.has(url)
          ? url
          : ''
        : /^(?:#|https?:|mailto:)/i.test(url)
          ? defaultUrlTransform(url)
          : '',
  });
  const title = note.title || 'Nota sin título';
  const markup = renderToStaticMarkup(
    <html lang="es">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta
          httpEquiv="Content-Security-Policy"
          content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'"
        />
        <title>{title}</title>
        <style>{exportStyles}</style>
      </head>
      <body>
        <main>
          <h1 className="note-title">{title}</h1>
          {body}
        </main>
      </body>
    </html>,
  );
  return {
    html: `<!doctype html>\n${markup}\n`,
    missingAttachments: [...images.values()].filter((image) => image === null)
      .length,
  };

  function prepareMedia() {
    return async (tree: {
      children: NonNullable<ExtraProps['node']>['children'];
    }) => {
      const nodes = [...tree.children];
      for (const node of nodes) {
        if (node.type !== 'element') continue;
        for (const child of node.children) nodes.push(child);
        if (node.tagName === 'img') {
          const url = node.properties.src;
          if (
            typeof url !== 'string' ||
            !managedImageUrlPattern.test(url) ||
            images.has(url)
          )
            continue;
          const name = attachmentName(url);
          const bytes = await readAvailableImage(imageSource, name);
          const extension = name.split('.').at(-1);
          images.set(
            url,
            bytes
              ? `data:image/${extension === 'jpg' ? 'jpeg' : extension};base64,${bytes.toString('base64')}`
              : null,
          );
        }
        if (node.tagName === 'pre' && preferences.mermaidEnabled) {
          const { language, text } = readMarkdownFence(node);
          if (language !== 'language-mermaid' || diagrams.has(text)) continue;
          try {
            const { renderAsync } = await import('pele/lazy');
            const { svg } = await renderAsync(text, {
              links: false,
              images: false,
            });
            diagrams.set(
              text,
              `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`,
            );
          } catch {
            // Preserve invalid or unsupported diagram source in the document.
            diagrams.set(text, null);
          }
        }
      }
    };
  }
}

const exportStyles = `
  :root { color-scheme: light; color: #202428; background: white; font: 16px/1.55 system-ui, sans-serif; }
  body { margin: 0; }
  main { max-width: 76ch; margin: auto; padding: 2rem; overflow-wrap: anywhere; }
  h1, h2, h3, h4, h5, h6 { break-after: avoid; line-height: 1.25; }
  .note-title { margin-top: 0; }
  a { color: #175db6; }
  img { max-width: 100%; object-fit: contain; }
  figure { margin: 1rem 0; text-align: center; }
  code, pre { font-family: ui-monospace, monospace; }
  code { background: #f4f6f8; padding: 0.1em 0.25em; border-radius: 3px; }
  pre { padding: 1rem; background: #f4f6f8; white-space: pre-wrap; overflow-wrap: anywhere; }
  pre code { background: none; padding: 0; }
  blockquote, .gfm-alert { margin: 1rem 0; border-inline-start: 4px solid var(--alert, #c8cfd6); padding: 0.25rem 1rem; }
  .gfm-alert-title { display: flex; gap: 0.5em; align-items: center; color: var(--alert); font-weight: 600; }
  .gfm-alert-title .icon { display: inline-flex; }
  .gfm-alert-type-note { --alert: #175db6; }
  .gfm-alert-type-tip { --alert: #157338; }
  .gfm-alert-type-important { --alert: #8250df; }
  .gfm-alert-type-warning { --alert: #9a6700; }
  .gfm-alert-type-caution { --alert: #cf222e; }
  .contains-task-list { list-style: none; padding-inline-start: 1.4em; }
  table { border-collapse: collapse; }
  th, td { border: 1px solid #c8cfd6; padding: 0.3em 0.55em; }
  tr, figure, math { break-inside: avoid; }
  .tok-keyword { color: #8250df; }
  .tok-string { color: #116329; }
  .tok-number, .tok-bool, .tok-null { color: #0550ae; }
  .tok-comment { color: #656d76; }
  @page { size: A4; margin: 15mm; }
  @media print { main { max-width: none; padding: 0; } :root { print-color-adjust: exact; } }
`;
