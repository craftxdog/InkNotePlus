import { z } from './validation';
import { appErrorSchema } from './ipc';

export const activityInputSchema = z
  .object({ offsetMinutes: z.number().int().min(-840).max(840) })
  .strict();
export const activityDaySchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    edited: z.number().int().min(0),
    created: z.number().int().min(0),
    completed: z.number().int().min(0),
  })
  .strict();
export const activityResultSchema = z.discriminatedUnion('ok', [
  z
    .object({ ok: z.literal(true), data: z.array(activityDaySchema).max(800) })
    .strict(),
  z.object({ ok: z.literal(false), error: appErrorSchema }).strict(),
]);
export type ActivityInput = z.output<typeof activityInputSchema>;
export type ActivityDay = z.output<typeof activityDaySchema>;

const dayCount = 52 * 7;
const dayLength = 86_400_000;
// UTC arithmetic keeps calendar days intact across daylight saving changes.
const shift = (date: string, days: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * dayLength)
    .toISOString()
    .slice(0, 10);

export function summarizeActivity(
  records: readonly ActivityDay[],
  today: string,
) {
  const byDate = new Map(records.map((record) => [record.date, record]));
  const days = Array.from({ length: dayCount }, (_, index) => {
    const date = shift(today, index - dayCount + 1);
    return byDate.get(date) ?? { date, edited: 0, created: 0, completed: 0 };
  });
  const totals = { edited: 0, created: 0, completed: 0 };
  let longestStreak = 0;
  let run = 0;
  for (const day of days) {
    totals.edited += day.edited;
    totals.created += day.created;
    totals.completed += day.completed;
    run = day.edited ? run + 1 : 0;
    longestStreak = Math.max(longestStreak, run);
  }
  // Today does not break the streak until it ends without activity.
  let index = days.length - 1;
  if (!days[index].edited) index -= 1;
  let currentStreak = 0;
  while (index >= 0 && days[index].edited) {
    currentStreak += 1;
    index -= 1;
  }
  return { days, totals, currentStreak, longestStreak };
}
