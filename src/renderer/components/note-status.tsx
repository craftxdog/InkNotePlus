import {
  createLucideIcon,
  CirclePause,
  CircleCheck,
  CircleX,
  CircleDashed,
} from 'lucide-react';
import type { NoteStatus } from '../../shared/note-metadata';

// Lucide's circle-play geometry, with the filled circle painted before the glyph.
// https://lucide.dev/icons/circle-play (ISC)
const ActiveStatusIcon = createLucideIcon({
  name: 'circle-play',
  size: 24,
  node: [
    ['circle', { cx: '12', cy: '12', r: '10', key: 'circle' }],
    [
      'path',
      {
        d: 'M9 9.003a1 1 0 0 1 1.517-.859l4.997 2.997a1 1 0 0 1 0 1.718l-4.997 2.997A1 1 0 0 1 9 14.996z',
        key: 'play',
      },
    ],
  ],
});

export const statusLabels = {
  none: 'Sin estado',
  active: 'Activo',
  onhold: 'En espera',
  completed: 'Completado',
  dropped: 'Descartado',
} as const;
export const statusIcons = {
  none: CircleDashed,
  active: ActiveStatusIcon,
  onhold: CirclePause,
  completed: CircleCheck,
  dropped: CircleX,
};

export function NoteStatusIcon({
  status,
  size = 18,
}: {
  status: NoteStatus;
  size?: number;
}) {
  if (status === 'none')
    return (
      <span
        className="note-status-icon-empty"
        style={{ width: size, height: size }}
        aria-hidden="true"
      />
    );
  const Icon = statusIcons[status];
  return (
    <Icon
      size={size}
      strokeWidth={1.6}
      className={`note-status-icon status-${status}`}
      aria-hidden="true"
    />
  );
}
