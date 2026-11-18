import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, X } from 'lucide-react';
import {
  clearPreviewMatches,
  findPreviewMatches,
  paintPreviewMatches,
} from '../editor/preview-find';
import { IconButton } from './icon-button';

export function PreviewFindBar({
  pane,
  onClose,
  onReveal,
}: {
  pane: HTMLElement;
  onClose: () => void;
  onReveal?: () => void;
}) {
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState<Range[]>([]);
  const [index, setIndex] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const reveal = (range: Range | undefined) => {
    if (!range) return;
    onReveal?.();
    range.startContainer.parentElement?.scrollIntoView({
      block: 'center',
      inline: 'nearest',
    });
  };
  const move = (step: number) => {
    if (!matches.length) return;
    const next = (index + step + matches.length) % matches.length;
    setIndex(next);
    reveal(matches[next]);
  };
  useEffect(() => input.current?.focus(), []);
  useEffect(() => clearPreviewMatches, []);
  useEffect(
    () => paintPreviewMatches(matches, matches[index]),
    [matches, index],
  );
  // Live edits refresh the results without pulling the reader to another match.
  useEffect(() => {
    const root = pane.querySelector('.mde-preview');
    if (!root || !query.trim()) return;
    let frame = 0;
    const observer = new MutationObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const next = findPreviewMatches(pane, query);
        setMatches(next);
        setIndex((value) => Math.min(value, Math.max(next.length - 1, 0)));
      });
    });
    observer.observe(root, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [pane, query]);
  return (
    <div className="preview-find" role="search">
      <input
        ref={input}
        type="search"
        aria-label="Buscar en la vista previa"
        placeholder="Buscar en la vista previa"
        value={query}
        onChange={(event) => {
          const next = findPreviewMatches(pane, event.target.value);
          setQuery(event.target.value);
          setMatches(next);
          setIndex(0);
          reveal(next[0]);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            move(event.shiftKey ? -1 : 1);
          } else if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            onClose();
          }
        }}
      />
      <span role="status">
        {query.trim() &&
          (matches.length
            ? `${index + 1} de ${matches.length}`
            : 'Sin resultados')}
      </span>
      <IconButton
        icon={ChevronUp}
        label="Coincidencia anterior"
        disabled={!matches.length}
        onClick={() => move(-1)}
      />
      <IconButton
        icon={ChevronDown}
        label="Coincidencia siguiente"
        disabled={!matches.length}
        onClick={() => move(1)}
      />
      <IconButton icon={X} label="Cerrar búsqueda" onClick={onClose} />
    </div>
  );
}
