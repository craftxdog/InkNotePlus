import { useEffect, useState } from 'react';
import { summarizeActivity, type ActivityDay } from '../../shared/activity';
import { useWorkspace } from '../state/workspace-context';
import { SettingGroup } from './settings-controls';

const level = (edited: number) =>
  edited === 0 ? 0 : edited < 3 ? 1 : edited < 6 ? 2 : edited < 10 ? 3 : 4;

const localDate = (now: Date) =>
  new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 10);

export function ActivitySettings() {
  const load = useWorkspace((state) => state.getActivity);
  const [records, setRecords] = useState<readonly ActivityDay[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    void load({ offsetMinutes: -new Date().getTimezoneOffset() }).then(
      (result) => {
        if (!active) return;
        if (result.ok) setRecords(result.data);
        else setFailed(true);
      },
    );
    return () => {
      active = false;
    };
  }, [load]);
  if (failed) return <p role="alert">No se pudo calcular la actividad.</p>;
  if (!records) return <p>Calculando actividad…</p>;
  const summary = summarizeActivity(records, localDate(new Date()));
  const stats = [
    ['Notas editadas', summary.totals.edited],
    ['Notas creadas', summary.totals.created],
    ['Tareas completadas', summary.totals.completed],
    ['Racha actual', `${summary.currentStreak} días`],
    ['Racha más larga', `${summary.longestStreak} días`],
  ] as const;
  return (
    <SettingGroup title="Actividad de las últimas 52 semanas">
      <dl className="activity-stats">
        {stats.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <div
        className="activity-grid"
        role="img"
        aria-label="Notas editadas por día"
      >
        {summary.days.map((day) => (
          <span
            key={day.date}
            data-level={level(day.edited)}
            title={`${day.date}: ${day.edited} editadas, ${day.created} creadas, ${day.completed} tareas completadas`}
          />
        ))}
      </div>
      <p className="settings-description">
        Se calcula en este equipo a partir del historial de tus notas.
      </p>
    </SettingGroup>
  );
}
