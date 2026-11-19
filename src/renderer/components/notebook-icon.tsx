import {
  BookOpen,
  Notebook,
  Inbox,
  BriefcaseBusiness,
  Rocket,
  Code2,
  Terminal,
  Folder,
  FileText,
  Book,
  GraduationCap,
  Lightbulb,
  FlaskConical,
  Bug,
  Heart,
  Star,
  House,
  Globe,
  Cloud,
  Database,
  Calendar,
  CircleCheck,
  Coffee,
  Music,
} from 'lucide-react';
import { lazy, Suspense, useEffect, useState } from 'react';
import type { NotebookIconName } from '../../shared/notebook-icons';
import { filterIconNames } from './notebook-icon-search';
import { useWorkspace } from '../state/workspace-context';
import { Modal } from './modal';

// Each extra icon is its own chunk, so the catalog never loads at startup.
const DynamicIcon = lazy(() =>
  import('lucide-react/dynamic').then((module) => ({
    default: module.DynamicIcon,
  })),
);

const icons = {
  'book-open': [BookOpen, 'Libro abierto'],
  notebook: [Notebook, 'Notebook'],
  inbox: [Inbox, 'Bandeja'],
  briefcase: [BriefcaseBusiness, 'Trabajo'],
  rocket: [Rocket, 'Proyecto'],
  code: [Code2, 'Código'],
  terminal: [Terminal, 'Terminal'],
  folder: [Folder, 'Carpeta'],
  'file-text': [FileText, 'Documento'],
  book: [Book, 'Libro'],
  'graduation-cap': [GraduationCap, 'Aprendizaje'],
  lightbulb: [Lightbulb, 'Idea'],
  flask: [FlaskConical, 'Investigación'],
  bug: [Bug, 'Error'],
  heart: [Heart, 'Personal'],
  star: [Star, 'Favorito'],
  home: [House, 'Casa'],
  globe: [Globe, 'Web'],
  cloud: [Cloud, 'Nube'],
  database: [Database, 'Datos'],
  calendar: [Calendar, 'Calendario'],
  check: [CircleCheck, 'Tareas'],
  coffee: [Coffee, 'Café'],
  music: [Music, 'Música'],
} as const;

export function NotebookIcon({
  name = 'book-open',
  size = 18,
}: {
  name?: NotebookIconName;
  size?: number;
}) {
  if (Object.hasOwn(icons, name)) {
    const Icon = icons[name as keyof typeof icons][0];
    return <Icon size={size} strokeWidth={1.6} aria-hidden="true" />;
  }
  const fallback = (
    <BookOpen size={size} strokeWidth={1.6} aria-hidden="true" />
  );
  return (
    <Suspense fallback={fallback}>
      <DynamicIcon
        name={name as never}
        size={size}
        strokeWidth={1.6}
        aria-hidden="true"
        fallback={() => fallback}
      />
    </Suspense>
  );
}
export function NotebookIconPicker({
  id,
  onClose,
}: {
  id: string;
  onClose: () => void;
}) {
  const book = useWorkspace((state) =>
    state.library.notebooks.find((value) => value.id === id),
  );
  const update = useWorkspace((state) => state.setNotebookIcon);
  const error = useWorkspace((state) => state.noteList.errorCode);
  const [query, setQuery] = useState('');
  const [catalog, setCatalog] = useState<readonly string[]>([]);
  useEffect(() => {
    let active = true;
    void import('lucide-react/dynamic').then(({ iconNames }) => {
      if (active) setCatalog(iconNames);
    });
    return () => {
      active = false;
    };
  }, []);
  if (!book) return null;
  const featured = Object.keys(icons);
  const names = query.trim()
    ? filterIconNames([...new Set([...featured, ...catalog])], query)
    : featured;
  return (
    <Modal title={`Icono de ${book.name}`} onClose={onClose}>
      <div className="dialog-form">
        <input
          autoFocus
          type="search"
          aria-label="Buscar iconos"
          placeholder="Buscar entre todos los iconos"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <div
          className="notebook-icon-picker"
          role="group"
          aria-label="Iconos de notebook"
        >
          {names.map((name) => {
            const label = Object.hasOwn(icons, name)
              ? icons[name as keyof typeof icons][1]
              : name;
            return (
              <button
                key={name}
                className="icon-button"
                type="button"
                aria-label={`Usar icono ${label}`}
                title={label}
                aria-pressed={book.icon === name}
                onClick={() => void update(id, name)}
              >
                <NotebookIcon name={name} size={24} />
              </button>
            );
          })}
          {!names.length && <p>No se encontraron iconos.</p>}
        </div>
        {error && <p role="alert">No se pudo guardar el icono.</p>}
      </div>
    </Modal>
  );
}
