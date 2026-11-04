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
import type { NotebookIconName } from '../../shared/notebook-icons';
import { useWorkspace } from '../state/workspace-context';
import { Modal } from './modal';

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
  const Icon = icons[name][0];
  return <Icon size={size} strokeWidth={1.6} aria-hidden="true" />;
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
  if (!book) return null;
  return (
    <Modal title={`Icono de ${book.name}`} onClose={onClose}>
      <div className="dialog-form">
        <div
          className="notebook-icon-picker"
          role="group"
          aria-label="Iconos de notebook"
        >
          {Object.entries(icons).map(([name, [Icon, label]]) => (
            <button
              key={name}
              className="icon-button"
              type="button"
              aria-label={`Usar icono ${label}`}
              title={label}
              aria-pressed={book.icon === name}
              onClick={() => void update(id, name as NotebookIconName)}
            >
              <Icon size={24} strokeWidth={1.6} />
            </button>
          ))}
        </div>
        {error && <p role="alert">No se pudo guardar el icono.</p>}
      </div>
    </Modal>
  );
}
