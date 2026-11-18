import { useEffect, useMemo, useState } from 'react';
import { RotateCcw, Undo2 } from 'lucide-react';
import type { NoteRevision, NoteRevisionSummary } from '../../shared/ipc';
import { diffLines, type DiffLine } from '../editor/line-diff';
import { useWorkspace, useWorkspaceStore } from '../state/workspace-context';
import { Modal } from './modal';

const contextLines = 3;
type DiffRow = DiffLine | { type: 'gap'; count: number };

function collapseUnchanged(lines: readonly DiffLine[]) {
  const rows: DiffRow[] = [];
  let index = 0;
  while (index < lines.length) {
    if (lines[index].type !== 'same') {
      rows.push(lines[index++]);
      continue;
    }
    let end = index;
    while (end < lines.length && lines[end].type === 'same') end++;
    const keepBefore = index === 0 ? 0 : contextLines;
    const keepAfter = end === lines.length ? 0 : contextLines;
    if (end - index <= keepBefore + keepAfter)
      rows.push(...lines.slice(index, end));
    else {
      rows.push(...lines.slice(index, index + keepBefore));
      rows.push({ type: 'gap', count: end - index - keepBefore - keepAfter });
      rows.push(...lines.slice(end - keepAfter, end));
    }
    index = end;
  }
  return rows;
}

export function NoteRevisionsDialog() {
  const store = useWorkspaceStore();
  const noteId = useWorkspace((state) => state.document.noteId);
  const title = useWorkspace((state) => state.document.title);
  const body = useWorkspace((state) => state.document.body);
  const close = useWorkspace((state) => state.setRevisionsOpen);
  const [revisions, setRevisions] = useState<NoteRevisionSummary[] | null>(
    null,
  );
  const [selected, setSelected] = useState<number | null>(null);
  const [version, setVersion] = useState<NoteRevision | null>(null);
  const [undo, setUndo] = useState<{ title: string; body: string } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    if (!noteId) return;
    let active = true;
    void (async () => {
      const state = store.getState();
      const saved = await state.flushDrafts();
      const result = saved
        ? await state.listNoteRevisions(noteId)
        : ({ ok: false } as const);
      if (!active) return;
      setFailed(!result.ok);
      if (!result.ok) return;
      setRevisions(result.data);
      setSelected(
        (value) =>
          value ?? result.data[1]?.revision ?? result.data[0]?.revision ?? null,
      );
    })();
    return () => {
      active = false;
    };
  }, [noteId, refresh, store]);
  useEffect(() => {
    if (!noteId || selected === null) return;
    let active = true;
    void store
      .getState()
      .getNoteRevision(noteId, selected)
      .then((result) => {
        if (!active) return;
        setFailed(!result.ok);
        setVersion(result.ok ? result.data : null);
      });
    return () => {
      active = false;
    };
  }, [noteId, selected, store]);
  const rows = useMemo(
    () => (version ? collapseUnchanged(diffLines(version.body, body)) : []),
    [version, body],
  );
  const current = revisions?.find(
    ({ revision }) => revision === selected,
  )?.current;
  const changed = rows.some(
    ({ type }) => type === 'added' || type === 'removed',
  );
  const apply = async (
    target: { title: string; body: string },
    next: typeof undo,
  ) => {
    setBusy(true);
    const result = await store.getState().restoreNoteVersion(target);
    setBusy(false);
    setFailed(!result.ok);
    if (!result.ok) return;
    setUndo(next);
    setRefresh((value) => value + 1);
  };
  return (
    <Modal
      title="Historial de revisiones"
      className="note-revisions"
      onClose={() => close(false)}
    >
      <div className="note-revisions-body">
        <ol className="note-revisions-list" aria-label="Versiones de la nota">
          {revisions?.map((revision) => (
            <li key={revision.revision}>
              <button
                type="button"
                aria-current={
                  revision.revision === selected ? 'true' : undefined
                }
                onClick={() => setSelected(revision.revision)}
              >
                <strong>{revision.title || 'Nota sin título'}</strong>
                <small>
                  {new Date(revision.createdAt).toLocaleString()}
                  {revision.current ? ' · Actual' : ''}
                </small>
              </button>
            </li>
          ))}
        </ol>
        <section className="note-revisions-detail" aria-label="Versión elegida">
          <div className="note-revisions-actions">
            {version && !current && (
              <button
                type="button"
                className="button button--primary"
                disabled={busy}
                onClick={() => void apply(version, { title, body })}
              >
                <RotateCcw size={16} aria-hidden="true" />
                Restaurar esta versión
              </button>
            )}
            {undo && (
              <button
                type="button"
                className="button"
                disabled={busy}
                onClick={() => void apply(undo, null)}
              >
                <Undo2 size={16} aria-hidden="true" />
                Deshacer restauración
              </button>
            )}
          </div>
          {failed && (
            <p role="alert" className="list-error">
              No se pudo completar la operación. Inténtalo de nuevo.
            </p>
          )}
          {version && version.title !== title && (
            <p className="note-revisions-title">
              Título en esta versión: <strong>{version.title}</strong>
            </p>
          )}
          {version && !changed && (
            <p role="status">El texto coincide con la nota actual.</p>
          )}
          {version && changed && (
            <ol className="revision-diff" aria-label="Cambios de esta versión">
              {rows.map((row, index) =>
                row.type === 'gap' ? (
                  <li key={index} data-diff="gap">
                    {row.count} líneas sin cambios
                  </li>
                ) : (
                  <li key={index} data-diff={row.type}>
                    <span aria-hidden="true">
                      {row.type === 'added'
                        ? '+'
                        : row.type === 'removed'
                          ? '−'
                          : ' '}
                    </span>
                    <code>{row.text}</code>
                  </li>
                ),
              )}
            </ol>
          )}
        </section>
      </div>
    </Modal>
  );
}
